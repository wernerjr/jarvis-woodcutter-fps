import { pgTable, text, timestamp, jsonb, primaryKey, integer } from 'drizzle-orm/pg-core';

export const guests = pgTable('guests', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const worlds = pgTable('worlds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const worldChunkState = pgTable(
  'world_chunk_state',
  {
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    chunkX: integer('chunk_x').notNull(),
    chunkZ: integer('chunk_z').notNull(),
    version: integer('version').notNull().default(0),
    state: jsonb('state').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldId, t.chunkX, t.chunkZ] }),
  })
);

export const playerState = pgTable(
  'player_state',
  {
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    state: jsonb('state').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.guestId, t.worldId] }),
  })
);
