import { pool } from './client.js';

// Minimal, idempotent migrations.
// (We already have base tables in the DB, but we don't have Drizzle's migration journal there.
// Running drizzle-orm migrator would try to re-create existing tables and fail.)
export async function runMigrations(logger?: { info: (o: any, msg?: string) => void; error?: (o: any, msg?: string) => void }) {
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "world_chunk_state" (
        "world_id" text NOT NULL REFERENCES "worlds"("id"),
        "chunk_x" integer NOT NULL,
        "chunk_z" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 0,
        "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "world_chunk_state_pk" PRIMARY KEY ("world_id", "chunk_x", "chunk_z")
      );
    `);

    logger?.info?.({ ms: Date.now() - startedAt }, 'db migrations ok (idempotent)');
  } catch (err) {
    logger?.error?.({ err }, 'db migrations failed');
    throw err;
  } finally {
    client.release();
  }
}
