import { createClient } from 'redis';
import { env } from '../env.js';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient> | null = null;

export async function getRedis(): Promise<RedisClient> {
  if (client) return client;
  if (connecting) return connecting;

  const url = env.SHARED_REDIS_URL;
  const c = createClient({ url });

  c.on('error', () => {
    // keep process alive; callers should handle failures per-op
  });

  connecting = (async () => {
    await c.connect();
    client = c;
    return c;
  })();

  return connecting;
}

export async function closeRedis() {
  const c = client;
  client = null;
  connecting = null;
  if (!c) return;
  try {
    await c.quit();
  } catch {
    try {
      await c.disconnect();
    } catch {}
  }
}
