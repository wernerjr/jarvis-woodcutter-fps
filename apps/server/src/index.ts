import Fastify from 'fastify';
import { env } from './env.js';
import { assertDbConnectionReady } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { registerAuthGuestRoutes } from './routes/authGuest.js';
import { registerPlayerStateRoutes } from './routes/playerState.js';
import { registerForgeStateRoutes } from './routes/forgeState.js';
import { registerAccountAuthRoutes } from './routes/accountAuth.js';
import { registerChestStateRoutes } from './routes/chestState.js';
import { registerPlayerSettingsRoutes } from './routes/playerSettings.js';
import { registerWs } from './ws/wsServer.js';
import { createMpStats, registerMpStatsRoute } from './mp/stats.js';
import { closeRedis, getRedis } from './redis/client.js';

const app = Fastify({ logger: true });

if (env.WOODCUTTER_WS_AUTH_SECRET === 'dev-insecure-secret') {
  app.log.warn(
    'WOODCUTTER_WS_AUTH_SECRET is not set; using dev-insecure-secret (do not use in production)'
  );
}

// Fail fast if DB is not reachable (e.g. Infisical env missing or wrong).
try {
  await assertDbConnectionReady(app.log);
  await runMigrations(app.log);
} catch (err) {
  app.log.error({ err }, 'db init failed at startup');
  process.exit(1);
}

// Fail fast if Redis is not reachable (volatile state for multiplayer).
try {
  await getRedis();
} catch (err) {
  app.log.error({ err }, 'redis init failed at startup');
  process.exit(1);
}

app.get('/api/health', async () => {
  return {
    ok: true,
    service: 'jarvis-woodcutter-fps-server',
    ts: new Date().toISOString(),
  };
});

await registerAuthGuestRoutes(app);
await registerAccountAuthRoutes(app);
await registerPlayerStateRoutes(app);
await registerPlayerSettingsRoutes(app);
await registerForgeStateRoutes(app);
await registerChestStateRoutes(app);

const mpStats = createMpStats();
await registerMpStatsRoute(app, mpStats, { token: env.WOODCUTTER_MP_STATS_TOKEN });
registerWs(app, { mpStats });

app.addHook('onClose', async () => {
  await closeRedis();
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
