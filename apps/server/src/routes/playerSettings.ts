import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { playerSettings, worlds } from '../db/schema.js';

const GetQuerySchema = z.object({
  guestId: z.string().min(8),
  worldId: z.string().min(1),
});

const SettingsSchema = z.object({
  perfEnabled: z.boolean().optional(),
  viewBobEnabled: z.boolean().optional(),
  preview3dEnabled: z.boolean().optional(),
});

const PutBodySchema = z.object({
  guestId: z.string().min(8),
  worldId: z.string().min(1),
  settings: SettingsSchema,
});

export async function registerPlayerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/player/settings', async (req, reply) => {
    const parsed = GetQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_query' });

    try {
      const rows = await db
        .select({ settings: playerSettings.settings, updatedAt: playerSettings.updatedAt })
        .from(playerSettings)
        .where(and(eq(playerSettings.guestId, parsed.data.guestId), eq(playerSettings.worldId, parsed.data.worldId)))
        .limit(1);

      if (rows.length === 0) {
        return { ok: true, settings: {}, updatedAt: null };
      }

      return { ok: true, settings: rows[0].settings ?? {}, updatedAt: rows[0].updatedAt };
    } catch (err) {
      req.log.error({ err }, 'get player settings failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });

  app.put('/api/player/settings', async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const { guestId, worldId, settings } = parsed.data;

    try {
      await db.insert(worlds).values({ id: worldId, name: worldId }).onConflictDoNothing()

      await db
        .insert(playerSettings)
        .values({ guestId, worldId, settings: settings as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [playerSettings.guestId, playerSettings.worldId],
          set: { settings: settings as any, updatedAt: new Date() },
        });

      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'put player settings failed');
      return reply.status(503).send({ ok: false, error: 'db_unavailable' });
    }
  });
}
