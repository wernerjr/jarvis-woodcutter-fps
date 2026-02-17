import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chestState } from '../db/schema.js';
import { getRedis } from '../redis/client.js';
import crypto from 'node:crypto';

const GetQuerySchema = z.object({
  worldId: z.string().min(1),
  chestId: z.string().min(3).max(128),
  guestId: z.string().min(8),
});

const ItemSlotSchema = z
  .object({
    id: z.string().min(1),
    qty: z.number().int().nonnegative(),
    meta: z.any().optional(),
  })
  .passthrough();

const ChestStateSchema = z
  .object({
    slots: z.array(ItemSlotSchema.nullable()).max(32).default([]),
  })
  .passthrough();

const PutBodySchema = z.object({
  worldId: z.string().min(1),
  chestId: z.string().min(3).max(128),
  guestId: z.string().min(8),
  lockToken: z.string().min(8),
  state: z.record(z.any()),
});

const ReleaseBodySchema = z.object({
  worldId: z.string().min(1),
  chestId: z.string().min(3).max(128),
  guestId: z.string().min(8),
  lockToken: z.string().min(8),
});

export async function registerChestStateRoutes(app: FastifyInstance) {
  const redisP = getRedis();
  let redis: Awaited<typeof redisP> | null = null;
  redisP.then((c) => (redis = c)).catch(() => (redis = null));

  const TTL_CACHE_S = 60 * 60; // 60m
  const TTL_LOCK_S = 10; // 10s (renew)

  const keyChestCache = (worldId: string, chestId: string) => `cache:chest:${worldId}:${chestId}`;
  const keyChestLock = (worldId: string, chestId: string) => `lock:chest:${worldId}:${chestId}`;

  function normSlots(st: any) {
    const parsed = ChestStateSchema.parse(st ?? {});
    const slots = Array.isArray(parsed.slots) ? parsed.slots.slice(0, 15) : [];
    while (slots.length < 15) slots.push(null);
    return { slots };
  }

  async function tryAcquireChestLock(params: { worldId: string; chestId: string; guestId: string }) {
    const r = redis;
    if (!r) return { ok: true as const, token: `nolock:${params.guestId}:${crypto.randomUUID()}` };

    const k = keyChestLock(params.worldId, params.chestId);

    // Token is opaque but includes guestId for troubleshooting.
    const token = `${params.guestId}:${crypto.randomUUID()}`;

    try {
      const ok = await r.set(k, token, { NX: true, EX: TTL_LOCK_S });
      if (ok === 'OK') return { ok: true as const, token };

      // Already locked: allow re-entry if same guest holds the lock.
      const cur = await r.get(k);
      if (cur && String(cur).startsWith(`${params.guestId}:`)) {
        // renew
        await r.set(k, String(cur), { XX: true, EX: TTL_LOCK_S });
        return { ok: true as const, token: String(cur) };
      }

      return { ok: false as const };
    } catch {
      // If Redis is flaky, prefer not blocking gameplay.
      return { ok: true as const, token };
    }
  }

  async function assertLock(params: { worldId: string; chestId: string; lockToken: string }) {
    const r = redis;
    if (!r) return true;
    const k = keyChestLock(params.worldId, params.chestId);
    try {
      const cur = await r.get(k);
      return String(cur || '') === String(params.lockToken || '');
    } catch {
      return true;
    }
  }

  app.get('/api/chest/state', async (req, reply) => {
    const parsed = GetQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_query' });

    const { worldId, chestId, guestId } = parsed.data;

    // 1) Ownership check (DB is source of truth)
    let ownerId = '';
    try {
      const rows = await db
        .select({ ownerId: chestState.ownerId })
        .from(chestState)
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)))
        .limit(1);

      if (rows.length === 0) return reply.status(404).send({ ok: false, error: 'not_found' });
      ownerId = String(rows[0].ownerId);
      if (ownerId !== String(guestId)) return reply.status(403).send({ ok: false, error: 'forbidden' });
    } catch (err) {
      req.log.error({ err }, 'get chest state owner check failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }

    // 2) Acquire lock
    const lock = await tryAcquireChestLock({ worldId, chestId, guestId });
    if (!lock.ok) return reply.status(423).send({ ok: false, error: 'locked' });

    // 3) Cache -> DB fallback
    const r = redis;
    if (r) {
      try {
        const cached = await r.get(keyChestCache(worldId, chestId));
        if (cached) {
          const parsed = JSON.parse(cached) as any;
          const st = normSlots(parsed?.state ?? {});
          return { ok: true, worldId, chestId, ownerId, lockToken: lock.token, state: st, updatedAt: parsed?.updatedAt ?? null };
        }
      } catch {
        // ignore
      }
    }

    try {
      const rows = await db
        .select({ state: chestState.state, updatedAt: chestState.updatedAt })
        .from(chestState)
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ ok: false, error: 'not_found' });

      const st = normSlots(rows[0].state ?? {});

      if (r) {
        try {
          void r.set(
            keyChestCache(worldId, chestId),
            JSON.stringify({ ownerId, state: st, updatedAt: rows[0].updatedAt?.toISOString?.() ?? rows[0].updatedAt ?? null }),
            { EX: TTL_CACHE_S }
          );
        } catch {
          // ignore
        }
      }

      return { ok: true, worldId, chestId, ownerId, lockToken: lock.token, state: st, updatedAt: rows[0].updatedAt };
    } catch (err) {
      req.log.error({ err }, 'get chest state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.put('/api/chest/state', async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { worldId, chestId, guestId, lockToken } = parsed.data;

    let st: any;
    try {
      st = normSlots(parsed.data.state);
    } catch {
      return reply.status(400).send({ ok: false, error: 'invalid_chest_state' });
    }

    try {
      // Verify ownership
      const rows = await db
        .select({ ownerId: chestState.ownerId })
        .from(chestState)
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ ok: false, error: 'not_found' });
      if (String(rows[0].ownerId) !== String(guestId)) return reply.status(403).send({ ok: false, error: 'forbidden' });

      // Verify lock
      const okLock = await assertLock({ worldId, chestId, lockToken });
      if (!okLock) return reply.status(423).send({ ok: false, error: 'locked' });

      await db
        .update(chestState)
        .set({ state: st as any, updatedAt: new Date() })
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)));

      // refresh cache + renew lock (best-effort)
      if (redis) {
        try {
          void redis
            .multi()
            .set(keyChestCache(worldId, chestId), JSON.stringify({ ownerId: guestId, state: st, updatedAt: new Date().toISOString() }), { EX: TTL_CACHE_S })
            .set(keyChestLock(worldId, chestId), String(lockToken), { XX: true, EX: TTL_LOCK_S })
            .exec();
        } catch {
          // ignore
        }
      }

      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'put chest state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.post('/api/chest/lock/release', async (req, reply) => {
    const parsed = ReleaseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { worldId, chestId, guestId, lockToken } = parsed.data;

    // Ownership check (avoid arbitrary unlock attempts)
    try {
      const rows = await db
        .select({ ownerId: chestState.ownerId })
        .from(chestState)
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ ok: false, error: 'not_found' });
      if (String(rows[0].ownerId) !== String(guestId)) return reply.status(403).send({ ok: false, error: 'forbidden' });
    } catch {
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }

    const r = redis;
    if (!r) return { ok: true };

    try {
      const k = keyChestLock(worldId, chestId);
      const cur = await r.get(k);
      if (String(cur || '') !== String(lockToken || '')) return reply.status(423).send({ ok: false, error: 'locked' });
      await r.del(k);
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });
}
