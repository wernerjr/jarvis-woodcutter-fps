CREATE TABLE IF NOT EXISTS "forge_state" (
  "world_id" text NOT NULL REFERENCES "worlds"("id"),
  "forge_id" text NOT NULL,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "forge_state_pk" PRIMARY KEY ("world_id", "forge_id")
);
