import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { forgeState } from '../db/schema.js';
import { getRedis } from '../redis/client.js';
import crypto from 'node:crypto';

const GetQuerySchema = z.object({
  worldId: z.string().min(1),
  forgeId: z.string().min(3).max(128),
  guestId: z.string().min(8),
});

const ItemSlotSchema = z
  .object({
    id: z.string().min(1),
    qty: z.number().int().nonnegative(),
    meta: z.any().optional(),
  })
  .passthrough();

const ForgeStateSchema = z
  .object({
    enabled: z.boolean().default(false),
    burn: z.number().nonnegative().default(0),
    prog: z.number().nonnegative().default(0),
    fuel: z.array(ItemSlotSchema.nullable()).length(2).default([null, null]),
    input: z.array(ItemSlotSchema.nullable()).length(2).default([null, null]),
    output: z.array(ItemSlotSchema.nullable()).length(2).default([null, null]),
  })
  .passthrough();

const PutBodySchema = z.object({
  worldId: z.string().min(1),
  forgeId: z.string().min(3).max(128),
  guestId: z.string().min(8),
  lockToken: z.string().min(8),
  state: z.record(z.any()),
});

const RenewBodySchema = z.object({
  worldId: z.string().min(1),
  forgeId: z.string().min(3).max(128),
  guestId: z.string().min(8),
  lockToken: z.string().min(8),
});

const ReleaseBodySchema = RenewBodySchema;

const ItemId = {
  LOG: 'log',
  STICK: 'stick',
  LEAF: 'leaf',
  IRON_ORE: 'iron_ore',
  IRON_INGOT: 'iron_ingot',
} as const;

const fuelSeconds: Record<string, number> = {
  [ItemId.LOG]: 22,
  [ItemId.STICK]: 6,
  [ItemId.LEAF]: 2,
};

const secondsPerIngot = 10;

function hasOre(st: any) {
  return (st.input || []).some((s: any) => s && s.id === ItemId.IRON_ORE && (s.qty ?? 0) > 0);
}

function hasFuel(st: any) {
  return (st.fuel || []).some((s: any) => s && (s.id === ItemId.LOG || s.id === ItemId.STICK || s.id === ItemId.LEAF) && (s.qty ?? 0) > 0);
}

function outputHasSpace(st: any) {
  for (const s of st.output || []) {
    if (!s) return true;
    if (s.id === ItemId.IRON_INGOT && (s.qty ?? 0) < 100) return true;
  }
  return false;
}

function consumeOneFuel(st: any) {
  for (let i = 0; i < st.fuel.length; i++) {
    const s = st.fuel[i];
    if (!s) continue;
    const add = fuelSeconds[String(s.id)] || 0;
    if (add <= 0) continue;

    s.qty = Math.max(0, (s.qty ?? 0) - 1);
    if (s.qty <= 0) st.fuel[i] = null;

    st.burn = Math.min(90, (st.burn ?? 0) + add);
    return true;
  }
  return false;
}

function consumeOneOre(st: any) {
  for (let i = 0; i < st.input.length; i++) {
    const s = st.input[i];
    if (!s || s.id !== ItemId.IRON_ORE) continue;
    s.qty = Math.max(0, (s.qty ?? 0) - 1);
    if (s.qty <= 0) st.input[i] = null;
    return true;
  }
  return false;
}

function addOutput(st: any, id: string, qty: number) {
  // prefer stacking existing
  for (let i = 0; i < st.output.length; i++) {
    const s = st.output[i];
    if (s && s.id === id && (s.qty ?? 0) < 100) {
      const can = Math.min(qty, 100 - (s.qty ?? 0));
      s.qty = (s.qty ?? 0) + can;
      qty -= can;
      if (qty <= 0) return true;
    }
  }
  for (let i = 0; i < st.output.length; i++) {
    const s = st.output[i];
    if (!s) {
      const put = Math.min(qty, 100);
      st.output[i] = { id, qty: put };
      qty -= put;
      if (qty <= 0) return true;
    }
  }
  return qty <= 0;
}

function advanceForge(st: any, dtSec: number) {
  let remaining = Math.max(0, dtSec);
  // cap catch-up to avoid huge loops (MVP)
  remaining = Math.min(remaining, 6 * 60 * 60);

  // If enabled but missing ore, shutdown immediately (matches client)
  if (st.enabled && !hasOre(st)) {
    st.enabled = false;
  }

  // Offline catch-up must account for the fact that burn is consumed over time.
  // We cannot just subtract the whole dt from burn first, otherwise we lose all
  // production that should have happened while burn was available.
  //
  // Model:
  // - While enabled, if we have ore + output space, we convert available burn-time
  //   into progress.
  // - When burn is low, we may auto-consume fuel (same rule as client).
  // - When we can't proceed (no ore/space, no fuel+burn), stop.
  let safety = 0;
  while (remaining > 1e-6 && st.enabled) {
    safety++;
    if (safety > 50000) break;

    const ore = hasOre(st);
    const outSpace = outputHasSpace(st);
    if (!ore || !outSpace) {
      // client shuts down immediately when ore missing; keep that behavior
      st.enabled = false;
      break;
    }

    const hf = hasFuel(st);

    // auto-consume fuel when low (or when burning and ore is present)
    if ((st.burn ?? 0) <= 0.1 || ((st.burn ?? 0) > 0 && (st.burn ?? 0) < 2.5 && ore)) {
      if (hf) consumeOneFuel(st);
    }

    const burnNow = Number(st.burn ?? 0);
    if (burnNow <= 0.001) {
      // No burn available; if no fuel, shut down.
      if (!hasFuel(st)) {
        st.enabled = false;
        break;
      }
      // otherwise loop will consume fuel on next iteration
      continue;
    }

    // Advance by the amount of time we can actually burn.
    const step = Math.min(remaining, burnNow);
    st.burn = Math.max(0, burnNow - step);
    remaining -= step;

    st.prog = (st.prog ?? 0) + step;

    while (st.prog >= secondsPerIngot) {
      if (!(hasOre(st) && outputHasSpace(st))) break;
      st.prog -= secondsPerIngot;
      consumeOneOre(st);
      addOutput(st, ItemId.IRON_INGOT, 1);
    }

    // Shutdown rule: if we ran out of ore, or we have no fuel and no burn left.
    if (!hasOre(st) || (!hasFuel(st) && (st.burn ?? 0) <= 0.001)) {
      st.enabled = false;
      break;
    }
  }

  // keep sane
  st.burn = Math.max(0, Math.min(90, Number(st.burn ?? 0)));
  st.prog = Math.max(0, Math.min(secondsPerIngot, Number(st.prog ?? 0)));
}

export async function registerForgeStateRoutes(app: FastifyInstance) {
  const redisP = getRedis();
  let redis: Awaited<typeof redisP> | null = null;
  redisP.then((c) => (redis = c)).catch(() => (redis = null));

  const TTL_CACHE_S = 60 * 60; // 60m
  const TTL_LOCK_S = 10; // 10s (renew)

  // Background forge processing: keep producing even when UI is closed.
  // Multi-pod: best-effort leader election via Redis lock.
  const WORKER_LOCK_KEY = 'lock:forge:worker';
  const WORKER_LOCK_TTL_S = 5;
  const WORKER_TICK_MS = 1000;

  const keyForgeCache = (worldId: string, forgeId: string) => `cache:forge:${worldId}:${forgeId}`;
  const keyForgeLock = (worldId: string, forgeId: string) => `lock:forge:${worldId}:${forgeId}`;

  let workerToken = crypto.randomUUID();
  let workerTimer: NodeJS.Timeout | null = null;

  async function workerTryAcquire() {
    const r = redis;
    if (!r) return false;
    try {
      const ok = await r.set(WORKER_LOCK_KEY, workerToken, { NX: true, EX: WORKER_LOCK_TTL_S });
      return ok === 'OK';
    } catch {
      return false;
    }
  }

  async function workerRenew() {
    const r = redis;
    if (!r) return false;
    try {
      const cur = await r.get(WORKER_LOCK_KEY);
      if (String(cur || '') !== workerToken) return false;
      await r.set(WORKER_LOCK_KEY, workerToken, { XX: true, EX: WORKER_LOCK_TTL_S });
      return true;
    } catch {
      return false;
    }
  }

  async function workerTick() {
    // Acquire/renew leader lock
    const got = await workerTryAcquire();
    const ok = got || (await workerRenew());
    if (!ok) return;

    const now = new Date();

    // NOTE: JSONB filter is a bit blunt; keep it small by capping rows.
    // We process only enabled forges.
    const rows = await db
      .select({ worldId: forgeState.worldId, forgeId: forgeState.forgeId, state: forgeState.state, updatedAt: forgeState.updatedAt })
      .from(forgeState)
      .limit(200);

    for (const row of rows) {
      const raw = (row.state ?? {}) as any;
      if (!raw?.enabled) continue;

      const st = ForgeStateSchema.parse(raw);
      const last = row.updatedAt ? new Date(row.updatedAt as any).getTime() : Date.now();
      const dtSec = (Date.now() - last) / 1000;
      if (dtSec < 0.25) continue;

      advanceForge(st, dtSec);

      await db
        .update(forgeState)
        .set({ state: st as any, updatedAt: now })
        .where(and(eq(forgeState.worldId, String(row.worldId)), eq(forgeState.forgeId, String(row.forgeId))));

      if (redis) {
        try {
          void redis.set(keyForgeCache(String(row.worldId), String(row.forgeId)), JSON.stringify({ state: st, updatedAt: now.toISOString() }), { EX: TTL_CACHE_S });
        } catch {}
      }
    }

    // renew once more at end
    await workerRenew();
  }

  async function tryAcquireForgeLock(params: { worldId: string; forgeId: string; guestId: string }) {
    const r = redis;
    if (!r) return { ok: true as const, token: `nolock:${params.guestId}:${crypto.randomUUID()}` };

    const k = keyForgeLock(params.worldId, params.forgeId);
    const token = `${params.guestId}:${crypto.randomUUID()}`;

    try {
      const ok = await r.set(k, token, { NX: true, EX: TTL_LOCK_S });
      if (ok === 'OK') return { ok: true as const, token };

      // allow re-entry if same guest holds the lock
      const cur = await r.get(k);
      if (cur && String(cur).startsWith(`${params.guestId}:`)) {
        await r.set(k, String(cur), { XX: true, EX: TTL_LOCK_S });
        return { ok: true as const, token: String(cur) };
      }

      return { ok: false as const };
    } catch {
      return { ok: true as const, token };
    }
  }

  async function assertLock(params: { worldId: string; forgeId: string; lockToken: string }) {
    const r = redis;
    if (!r) return true;
    const k = keyForgeLock(params.worldId, params.forgeId);
    try {
      const cur = await r.get(k);
      return String(cur || '') === String(params.lockToken || '');
    } catch {
      return true;
    }
  }

  // Start background worker (best-effort)
  if (!workerTimer) {
    workerTimer = setInterval(() => {
      workerTick().catch(() => null);
    }, WORKER_TICK_MS);
  }

  app.addHook('onClose', async () => {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  });

  app.get('/api/forge/state', async (req, reply) => {
    const parsed = GetQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_query' });

    const { worldId, forgeId, guestId } = parsed.data;

    // Acquire lock first (prevents 2 sessions from fighting)
    const lock = await tryAcquireForgeLock({ worldId, forgeId, guestId });
    if (!lock.ok) return reply.status(423).send({ ok: false, error: 'locked' });

    const r = redis;
    if (r) {
      try {
        const cached = await r.get(keyForgeCache(worldId, forgeId));
        if (cached) {
          const parsed = JSON.parse(cached) as any;
          const st = ForgeStateSchema.parse(parsed?.state ?? {});
          return { ok: true, worldId, forgeId, lockToken: lock.token, state: st, updatedAt: parsed?.updatedAt ?? null };
        }
      } catch {
        // ignore
      }
    }

    try {
      const rows = await db
        .select({ state: forgeState.state, updatedAt: forgeState.updatedAt })
        .from(forgeState)
        .where(and(eq(forgeState.worldId, worldId), eq(forgeState.forgeId, forgeId)))
        .limit(1);

      const now = new Date();
      if (rows.length === 0) {
        // Create empty state
        const st = ForgeStateSchema.parse({});
        await db.insert(forgeState).values({ worldId, forgeId, state: st as any, updatedAt: now });

        if (r) {
          try {
            void r.set(keyForgeCache(worldId, forgeId), JSON.stringify({ state: st, updatedAt: now.toISOString() }), { EX: TTL_CACHE_S });
          } catch {}
        }

        return { ok: true, worldId, forgeId, lockToken: lock.token, state: st, updatedAt: now.toISOString() };
      }

      const raw = (rows[0].state ?? {}) as any;
      const st = ForgeStateSchema.parse(raw);
      const last = rows[0].updatedAt ? new Date(rows[0].updatedAt).getTime() : Date.now();
      const dtSec = (Date.now() - last) / 1000;

      // Catch-up processing (offline)
      advanceForge(st, dtSec);

      // Persist catch-up and return
      await db
        .update(forgeState)
        .set({ state: st as any, updatedAt: now })
        .where(and(eq(forgeState.worldId, worldId), eq(forgeState.forgeId, forgeId)));

      if (r) {
        try {
          void r.set(keyForgeCache(worldId, forgeId), JSON.stringify({ state: st, updatedAt: now.toISOString() }), { EX: TTL_CACHE_S });
        } catch {}
      }

      return { ok: true, worldId, forgeId, lockToken: lock.token, state: st, updatedAt: now.toISOString() };
    } catch (err) {
      req.log.error({ err }, 'get forge state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.put('/api/forge/state', async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { worldId, forgeId, lockToken } = parsed.data;

    let st: any;
    try {
      st = ForgeStateSchema.parse(parsed.data.state);
    } catch {
      return reply.status(400).send({ ok: false, error: 'invalid_forge_state' });
    }

    try {
      const okLock = await assertLock({ worldId, forgeId, lockToken });
      if (!okLock) return reply.status(423).send({ ok: false, error: 'locked' });

      const now = new Date();
      await db
        .insert(forgeState)
        .values({ worldId, forgeId, state: st, updatedAt: now })
        .onConflictDoUpdate({
          target: [forgeState.worldId, forgeState.forgeId],
          set: { state: st, updatedAt: now },
        });

      if (redis) {
        try {
          void redis
            .multi()
            .set(keyForgeCache(worldId, forgeId), JSON.stringify({ state: st, updatedAt: now.toISOString() }), { EX: TTL_CACHE_S })
            .set(keyForgeLock(worldId, forgeId), String(lockToken), { XX: true, EX: TTL_LOCK_S })
            .exec();
        } catch {}
      }

      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'put forge state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.get('/api/forge/lock/status', async (req, reply) => {
    const parsed = GetQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_query' });

    const { worldId, forgeId, guestId } = parsed.data;

    const r = redis;
    if (!r) return { ok: true, locked: false };

    try {
      const cur = await r.get(keyForgeLock(worldId, forgeId));
      if (!cur) return { ok: true, locked: false };
      const bySelf = String(cur).startsWith(`${guestId}:`);
      return { ok: true, locked: !bySelf, bySelf };
    } catch {
      return { ok: true, locked: false };
    }
  });

  app.post('/api/forge/lock/renew', async (req, reply) => {
    const parsed = RenewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { worldId, forgeId, lockToken } = parsed.data;

    const r = redis;
    if (!r) return { ok: true };

    try {
      const k = keyForgeLock(worldId, forgeId);
      const cur = await r.get(k);
      if (String(cur || '') !== String(lockToken || '')) return reply.status(423).send({ ok: false, error: 'locked' });
      await r.set(k, String(lockToken), { XX: true, EX: TTL_LOCK_S });
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });

  app.post('/api/forge/lock/release', async (req, reply) => {
    const parsed = ReleaseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { worldId, forgeId, lockToken } = parsed.data;

    const r = redis;
    if (!r) return { ok: true };

    try {
      const k = keyForgeLock(worldId, forgeId);
      const cur = await r.get(k);
      if (String(cur || '') !== String(lockToken || '')) return reply.status(423).send({ ok: false, error: 'locked' });
      await r.del(k);
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });
}
