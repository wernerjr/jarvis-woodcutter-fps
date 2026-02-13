import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { guests, playerState, worlds } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const BodySchema = z.object({
  guestId: z.string().min(8).max(128).optional(),
});

const DEFAULT_WORLD_ID = 'world-1';
const DEFAULT_WORLD_NAME = 'World 1';

export async function registerAuthGuestRoutes(app: FastifyInstance) {
  app.post('/api/auth/guest', async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'invalid_body' });
    }

    const incomingGuestId = parsed.data.guestId;
    const guestId = incomingGuestId ?? crypto.randomUUID();

    try {
      // Ensure default world exists.
      await db
        .insert(worlds)
        .values({ id: DEFAULT_WORLD_ID, name: DEFAULT_WORLD_NAME })
        .onConflictDoNothing();

      // Upsert guest (minimal).
      await db
        .insert(guests)
        .values({ id: guestId, lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: guests.id,
          set: { lastSeenAt: new Date() },
        });

      // Ensure player_state row exists.
      const existing = await db
        .select({ guestId: playerState.guestId, worldId: playerState.worldId })
        .from(playerState)
        .where(and(eq(playerState.guestId, guestId), eq(playerState.worldId, DEFAULT_WORLD_ID)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(playerState).values({
          guestId,
          worldId: DEFAULT_WORLD_ID,
          state: {},
          updatedAt: new Date(),
        });
      }

      return {
        ok: true,
        guestId,
        worldId: DEFAULT_WORLD_ID,
      };
    } catch (err) {
      req.log.error({ err }, 'auth/guest failed');
      return reply.status(503).send({
        ok: false,
        error: 'db_unavailable',
        hint: 'Check DATABASE_URL (shared-postgres credentials) and run migrations.',
      });
    }
  });
}
