import Fastify from 'fastify';
import { env } from './env.js';

const app = Fastify({ logger: true });

app.get('/api/health', async () => {
  return {
    ok: true,
    service: 'jarvis-woodcutter-fps-server',
    ts: new Date().toISOString(),
  };
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
