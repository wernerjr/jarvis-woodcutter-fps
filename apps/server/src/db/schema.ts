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

export const forgeState = pgTable(
  'forge_state',
  {
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    forgeId: text('forge_id').notNull(),
    state: jsonb('state').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldId, t.forgeId] }),
  })
);

export const chestState = pgTable(
  'chest_state',
  {
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    chestId: text('chest_id').notNull(),
    ownerId: text('owner_id').notNull(),
    state: jsonb('state').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldId, t.chestId] }),
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

export const playerSettings = pgTable(
  'player_settings',
  {
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    settings: jsonb('settings').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.guestId, t.worldId] }),
  })
);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const accountLinks = pgTable('account_links', {
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id)
    .unique(),
  guestId: text('guest_id')
    .notNull()
    .references(() => guests.id)
    .unique(),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
});

export const magicCodes = pgTable('magic_codes', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  purpose: text('purpose').notNull(), // link|login
  guestId: text('guest_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  requestIp: text('request_ip'),
});
