import Fastify from 'fastify';
import { env } from './env.js';
import { assertDbConnectionReady } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { registerAuthGuestRoutes } from './routes/authGuest.js';
import { registerPlayerStateRoutes } from './routes/playerState.js';
import { registerWs } from './ws/wsServer.js';

const app = Fastify({ logger: true });

// Fail fast if DB is not reachable (e.g. Infisical env missing or wrong).
try {
  await assertDbConnectionReady(app.log);
  await runMigrations(app.log);
} catch (err) {
  app.log.error({ err }, 'db init failed at startup');
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
await registerPlayerStateRoutes(app);
registerWs(app);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
