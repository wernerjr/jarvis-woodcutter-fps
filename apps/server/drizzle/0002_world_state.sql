CREATE TABLE IF NOT EXISTS "world_chunk_state" (
  "world_id" text NOT NULL REFERENCES "worlds"("id"),
  "chunk_x" integer NOT NULL,
  "chunk_z" integer NOT NULL,
  "version" integer NOT NULL DEFAULT 0,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "world_chunk_state_pk" PRIMARY KEY ("world_id", "chunk_x", "chunk_z")
);
