import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { guests, playerState, worlds } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { env } from '../env.js';
import crypto from 'node:crypto';

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signGuestToken(params: { guestId: string; expMs: number }) {
  const payload = JSON.stringify({ gid: params.guestId, exp: params.expMs });
  const payloadB64 = base64url(Buffer.from(payload, 'utf8'));
  const sig = crypto.createHmac('sha256', env.WOODCUTTER_WS_AUTH_SECRET).update(payloadB64).digest();
  const sigB64 = base64url(sig);
  return `${payloadB64}.${sigB64}`;
}

const BodySchema = z.object({
  guestId: z.string().min(8).max(128).optional(),
  worldId: z
    .string()
    .min(3)
    .max(40)
    .regex(/^world-[a-z0-9-]+$/i, 'worldId must match /^world-[a-z0-9-]+$/')
    .optional(),
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

    const worldId = parsed.data.worldId || DEFAULT_WORLD_ID;
    const worldName = worldId === DEFAULT_WORLD_ID ? DEFAULT_WORLD_NAME : worldId;

    try {
      // Ensure world exists.
      await db
        .insert(worlds)
        .values({ id: worldId, name: worldName })
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
        .where(and(eq(playerState.guestId, guestId), eq(playerState.worldId, worldId)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(playerState).values({
          guestId,
          worldId,
          state: {},
          updatedAt: new Date(),
        });
      }

      // Short-lived WS auth token (prevents spoofing guestId on WS join).
      const now = Date.now();
      const expMs = now + 60 * 60 * 1000; // 60 min
      const token = signGuestToken({ guestId, expMs });

      return {
        ok: true,
        guestId,
        worldId,
        token,
        tokenExpMs: expMs,
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
