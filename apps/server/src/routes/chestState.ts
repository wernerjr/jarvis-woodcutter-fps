import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chestState } from '../db/schema.js';

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
  state: z.record(z.any()),
});

export async function registerChestStateRoutes(app: FastifyInstance) {
  app.get('/api/chest/state', async (req, reply) => {
    const parsed = GetQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_query' });

    const { worldId, chestId, guestId } = parsed.data;

    try {
      const rows = await db
        .select({ ownerId: chestState.ownerId, state: chestState.state, updatedAt: chestState.updatedAt })
        .from(chestState)
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)))
        .limit(1);

      if (rows.length === 0) {
        // Chest records are created on placement via WS. If missing, treat as not found.
        return reply.status(404).send({ ok: false, error: 'not_found' });
      }

      if (String(rows[0].ownerId) !== String(guestId)) {
        return reply.status(403).send({ ok: false, error: 'forbidden' });
      }

      const st = ChestStateSchema.parse(rows[0].state ?? {});
      // normalize to 16 slots
      const slots = Array.isArray(st.slots) ? st.slots.slice(0, 16) : [];
      while (slots.length < 16) slots.push(null);

      return { ok: true, worldId, chestId, state: { slots }, updatedAt: rows[0].updatedAt };
    } catch (err) {
      req.log.error({ err }, 'get chest state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.put('/api/chest/state', async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { worldId, chestId, guestId } = parsed.data;

    let st: any;
    try {
      st = ChestStateSchema.parse(parsed.data.state);
    } catch {
      return reply.status(400).send({ ok: false, error: 'invalid_chest_state' });
    }

    // normalize slots length 16
    st.slots = Array.isArray(st.slots) ? st.slots.slice(0, 16) : [];
    while (st.slots.length < 16) st.slots.push(null);

    try {
      // Verify ownership
      const rows = await db
        .select({ ownerId: chestState.ownerId })
        .from(chestState)
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ ok: false, error: 'not_found' });
      if (String(rows[0].ownerId) !== String(guestId)) return reply.status(403).send({ ok: false, error: 'forbidden' });

      await db
        .update(chestState)
        .set({ state: st as any, updatedAt: new Date() })
        .where(and(eq(chestState.worldId, worldId), eq(chestState.chestId, chestId)));

      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'put chest state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });
}
