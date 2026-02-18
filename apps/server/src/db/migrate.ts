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

    await client.query(`
      CREATE TABLE IF NOT EXISTS "forge_state" (
        "world_id" text NOT NULL REFERENCES "worlds"("id"),
        "forge_id" text NOT NULL,
        "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "forge_state_pk" PRIMARY KEY ("world_id", "forge_id")
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "chest_state" (
        "world_id" text NOT NULL REFERENCES "worlds"("id"),
        "chest_id" text NOT NULL,
        "owner_id" text NOT NULL,
        "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chest_state_pk" PRIMARY KEY ("world_id", "chest_id")
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "player_settings" (
        "guest_id" text NOT NULL REFERENCES "guests"("id"),
        "world_id" text NOT NULL REFERENCES "worlds"("id"),
        "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "player_settings_pk" PRIMARY KEY ("guest_id", "world_id")
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id" text PRIMARY KEY,
        "email" text NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "account_links" (
        "account_id" text NOT NULL UNIQUE REFERENCES "accounts"("id"),
        "guest_id" text NOT NULL UNIQUE REFERENCES "guests"("id"),
        "linked_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "magic_codes" (
        "id" text PRIMARY KEY,
        "email" text NOT NULL,
        "code_hash" text NOT NULL,
        "purpose" text NOT NULL,
        "guest_id" text,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "request_ip" text
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "magic_codes_email_purpose_created_idx"
      ON "magic_codes" ("email", "purpose", "created_at" DESC);
    `);

    logger?.info?.({ ms: Date.now() - startedAt }, 'db migrations ok (idempotent)');
  } catch (err) {
    logger?.error?.({ err }, 'db migrations failed');
    throw err;
  } finally {
    client.release();
  }
}
