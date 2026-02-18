import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { playerState, worlds } from '../db/schema.js';

const GetQuerySchema = z.object({
  guestId: z.string().min(8),
  worldId: z.string().min(1),
});

const PutBodySchema = z.object({
  guestId: z.string().min(8),
  worldId: z.string().min(1),
  state: z.record(z.any()),
});

export async function registerPlayerStateRoutes(app: FastifyInstance) {
  app.get('/api/player/state', async (req, reply) => {
    const parsed = GetQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'invalid_query' });
    }

    try {
      const rows = await db
        .select({ state: playerState.state, updatedAt: playerState.updatedAt })
        .from(playerState)
        .where(and(eq(playerState.guestId, parsed.data.guestId), eq(playerState.worldId, parsed.data.worldId)))
        .limit(1);

      if (rows.length === 0) {
        return reply.status(404).send({ ok: false, error: 'not_found' });
      }

      return { ok: true, state: rows[0].state ?? {}, updatedAt: rows[0].updatedAt };
    } catch (err) {
      req.log.error({ err }, 'get player state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.put('/api/player/state', async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'invalid_body' });
    }

    try {
      const { guestId, worldId, state } = parsed.data
      await db.insert(worlds).values({ id: worldId, name: worldId }).onConflictDoNothing()

      await db
        .insert(playerState)
        .values({ guestId, worldId, state, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [playerState.guestId, playerState.worldId],
          set: { state, updatedAt: new Date() },
        })

      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'put player state failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });
}
