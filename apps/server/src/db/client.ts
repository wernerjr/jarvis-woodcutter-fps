import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool);

export async function assertDbConnectionReady(logger?: { info: (o: any, msg?: string) => void }) {
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    const res = await client.query('select 1 as ok');
    logger?.info(
      { ok: res.rows?.[0]?.ok === 1, ms: Date.now() - startedAt },
      'db connection ok'
    );
  } finally {
    client.release();
  }
}
