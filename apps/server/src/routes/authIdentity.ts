import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../db/client.js'
import { deviceGuestLinks, devices, guests, playerState, users, worlds } from '../db/schema.js'
import { env } from '../env.js'

const DEFAULT_WORLD_ID = 'world-1'
const DEFAULT_WORLD_NAME = 'World 1'

function normalizeUsername(v: string) {
  return String(v || '').trim().toLowerCase()
}

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function signGuestToken(params: { guestId: string; expMs: number }) {
  const payload = JSON.stringify({ gid: params.guestId, exp: params.expMs })
  const payloadB64 = base64url(Buffer.from(payload, 'utf8'))
  const sig = crypto.createHmac('sha256', env.WOODCUTTER_WS_AUTH_SECRET).update(payloadB64).digest()
  const sigB64 = base64url(sig)
  return `${payloadB64}.${sigB64}`
}

function hashPassword(password: string, salt?: string) {
  const realSalt = salt || crypto.randomBytes(16).toString('hex')
  const out = crypto.scryptSync(password, realSalt, 64).toString('hex')
  return `${realSalt}:${out}`
}

function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = String(encoded || '').split(':')
  if (!salt || !expected) return false
  const got = hashPassword(password, salt).split(':')[1]
  try {
    return crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

const GuestByDeviceSchema = z.object({
  deviceKey: z.string().min(16).max(200),
  worldId: z.string().min(3).max(40).regex(/^world-[a-z0-9-]+$/i).optional(),
})

const RegisterSchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(120),
  guestId: z.string().min(8).max(128).optional(),
})

const LoginSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(120),
})

async function ensureWorld(worldId: string) {
  const worldName = worldId === DEFAULT_WORLD_ID ? DEFAULT_WORLD_NAME : worldId
  await db.insert(worlds).values({ id: worldId, name: worldName }).onConflictDoNothing()
}

async function ensurePlayerState(guestId: string, worldId: string) {
  const existing = await db
    .select({ guestId: playerState.guestId, worldId: playerState.worldId })
    .from(playerState)
    .where(and(eq(playerState.guestId, guestId), eq(playerState.worldId, worldId)))
    .limit(1)

  if (!existing.length) {
    await db.insert(playerState).values({ guestId, worldId, state: {}, updatedAt: new Date() })
  }
}

function makeAuthPayload(guestId: string, worldId: string) {
  const now = Date.now()
  const expMs = now + 60 * 60 * 1000
  const token = signGuestToken({ guestId, expMs })
  return { ok: true, guestId, worldId, token, tokenExpMs: expMs }
}

export async function registerAuthIdentityRoutes(app: FastifyInstance) {
  app.post('/api/auth/device/guest', async (req, reply) => {
    const parsed = GuestByDeviceSchema.safeParse(req.body ?? {})
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' })

    const worldId = parsed.data.worldId || DEFAULT_WORLD_ID
    await ensureWorld(worldId)

    const deviceKey = String(parsed.data.deviceKey)

    await db
      .insert(devices)
      .values({ id: crypto.randomUUID(), deviceKey, lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: devices.deviceKey, set: { lastSeenAt: new Date() } })

    const drows = await db.select({ id: devices.id }).from(devices).where(eq(devices.deviceKey, deviceKey)).limit(1)
    const deviceId = drows[0]?.id
    if (!deviceId) return reply.status(500).send({ ok: false, error: 'device_lookup_failed' })

    const links = await db
      .select({ guestId: deviceGuestLinks.guestId, migratedAt: deviceGuestLinks.migratedAt, active: deviceGuestLinks.active })
      .from(deviceGuestLinks)
      .where(eq(deviceGuestLinks.deviceId, deviceId))
      .limit(1)

    if (links.length) {
      const link = links[0]
      if (!link.active || link.migratedAt) {
        return reply.status(409).send({ ok: false, error: 'guest_migrated_requires_login' })
      }

      const guestId = link.guestId
      await db.update(guests).set({ lastSeenAt: new Date() }).where(eq(guests.id, guestId))
      await ensurePlayerState(guestId, worldId)
      return makeAuthPayload(guestId, worldId)
    }

    const guestId = crypto.randomUUID()
    await db.insert(guests).values({ id: guestId, lastSeenAt: new Date() })
    await db.insert(deviceGuestLinks).values({ deviceId, guestId, active: true, updatedAt: new Date() })
    await ensurePlayerState(guestId, worldId)

    return makeAuthPayload(guestId, worldId)
  })

  app.post('/api/auth/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body ?? {})
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' })

    const usernameNorm = normalizeUsername(parsed.data.username)
    const passwordHash = hashPassword(parsed.data.password)
    let guestId = parsed.data.guestId || null

    if (guestId) {
      const g = await db.select({ id: guests.id }).from(guests).where(eq(guests.id, guestId)).limit(1)
      if (!g.length) return reply.status(404).send({ ok: false, error: 'guest_not_found' })
    } else {
      // Registro direto (sem guest prévio): cria guest base para progresso
      guestId = crypto.randomUUID()
      await db.insert(guests).values({ id: guestId, lastSeenAt: new Date() })
      await ensurePlayerState(guestId, DEFAULT_WORLD_ID)
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.usernameNorm, usernameNorm)).limit(1)
    if (existing.length) return reply.status(409).send({ ok: false, error: 'username_taken' })

    const userId = crypto.randomUUID()
    await db.insert(users).values({
      id: userId,
      username: parsed.data.username,
      usernameNorm,
      passwordHash,
      guestId,
      lastSeenAt: new Date(),
    })

    if (parsed.data.guestId) {
      await db
        .update(deviceGuestLinks)
        .set({ active: false, migratedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(deviceGuestLinks.guestId, parsed.data.guestId), isNull(deviceGuestLinks.migratedAt)))
    }

    return { ok: true, userId, guestId }
  })

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body ?? {})
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' })

    const usernameNorm = normalizeUsername(parsed.data.username)
    const rows = await db
      .select({ id: users.id, passwordHash: users.passwordHash, guestId: users.guestId })
      .from(users)
      .where(eq(users.usernameNorm, usernameNorm))
      .limit(1)

    if (!rows.length) return reply.status(401).send({ ok: false, error: 'invalid_credentials' })

    const user = rows[0]
    if (!verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ ok: false, error: 'invalid_credentials' })
    }

    if (!user.guestId) {
      return reply.status(409).send({ ok: false, error: 'user_not_linked_to_progress' })
    }

    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id))
    await db.update(guests).set({ lastSeenAt: new Date() }).where(eq(guests.id, user.guestId))

    return makeAuthPayload(user.guestId, DEFAULT_WORLD_ID)
  })
}
