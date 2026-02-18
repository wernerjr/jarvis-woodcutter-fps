import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { accountLinks, accounts, guests, magicCodes } from '../db/schema.js';
import { env } from '../env.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const RESEND_COOLDOWN_MS = 30 * 1000;
const VERIFY_MAX_ATTEMPTS_WINDOW_MS = 5 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 12;

const attemptByKey = new Map<string, number[]>();

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signGuestToken(params: { guestId: string; expMs: number }) {
  const payload = JSON.stringify({ gid: params.guestId, exp: params.expMs });
  const payloadB64 = base64url(Buffer.from(payload, 'utf8'));
  const sig = crypto.createHmac('sha256', env.WOODCUTTER_WS_AUTH_SECRET).update(payloadB64).digest();
  const sigB64 = base64url(sig);
  return `${payloadB64}.${sigB64}`;
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(email: string, code: string) {
  return crypto.createHash('sha256').update(`${normalizeEmail(email)}:${code}`).digest('hex');
}

function tooManyAttempts(key: string) {
  const now = Date.now();
  const arr = attemptByKey.get(key) || [];
  const recent = arr.filter((t) => now - t <= VERIFY_MAX_ATTEMPTS_WINDOW_MS);
  if (recent.length >= VERIFY_MAX_ATTEMPTS) return true;
  recent.push(now);
  attemptByKey.set(key, recent);
  return false;
}

async function createMagicCode(params: {
  email: string;
  purpose: 'link' | 'login';
  guestId?: string;
  ip?: string;
}) {
  const code = makeCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await db.insert(magicCodes).values({
    id: crypto.randomUUID(),
    email: normalizeEmail(params.email),
    codeHash: hashCode(params.email, code),
    purpose: params.purpose,
    guestId: params.guestId,
    expiresAt,
    requestIp: params.ip || null,
    createdAt: now,
  });

  return { code, expiresAt };
}

async function findLastCode(email: string, purpose: 'link' | 'login') {
  const rows = await db
    .select({ createdAt: magicCodes.createdAt })
    .from(magicCodes)
    .where(and(eq(magicCodes.email, normalizeEmail(email)), eq(magicCodes.purpose, purpose)))
    .orderBy(desc(magicCodes.createdAt))
    .limit(1);
  return rows[0] || null;
}

async function consumeCode(params: {
  email: string;
  purpose: 'link' | 'login';
  code: string;
  guestId?: string;
}) {
  const rows = await db
    .select({
      id: magicCodes.id,
      guestId: magicCodes.guestId,
      expiresAt: magicCodes.expiresAt,
      usedAt: magicCodes.usedAt,
    })
    .from(magicCodes)
    .where(
      and(
        eq(magicCodes.email, normalizeEmail(params.email)),
        eq(magicCodes.purpose, params.purpose),
        eq(magicCodes.codeHash, hashCode(params.email, params.code)),
        isNull(magicCodes.usedAt)
      )
    )
    .orderBy(desc(magicCodes.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false as const, error: 'invalid_code' };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false as const, error: 'code_expired' };

  if (params.purpose === 'link' && params.guestId && row.guestId !== params.guestId) {
    return { ok: false as const, error: 'guest_mismatch' };
  }

  await db.update(magicCodes).set({ usedAt: new Date() }).where(eq(magicCodes.id, row.id));
  return { ok: true as const, guestId: row.guestId || null };
}

const StartLinkSchema = z.object({
  guestId: z.string().min(8),
  email: z.string().min(5),
});

const VerifyLinkSchema = z.object({
  guestId: z.string().min(8),
  email: z.string().min(5),
  code: z.string().regex(/^\d{6}$/),
});

const StartLoginSchema = z.object({
  email: z.string().min(5),
});

const VerifyLoginSchema = z.object({
  email: z.string().min(5),
  code: z.string().regex(/^\d{6}$/),
});

export async function registerAccountAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/link/start', async (req, reply) => {
    const parsed = StartLinkSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const email = normalizeEmail(parsed.data.email);
    if (!EMAIL_RE.test(email)) return reply.status(400).send({ ok: false, error: 'invalid_email' });

    const guestRows = await db.select({ id: guests.id }).from(guests).where(eq(guests.id, parsed.data.guestId)).limit(1);
    if (!guestRows.length) return reply.status(404).send({ ok: false, error: 'guest_not_found' });

    const prev = await findLastCode(email, 'link');
    if (prev && Date.now() - new Date(prev.createdAt).getTime() < RESEND_COOLDOWN_MS) {
      return reply.status(429).send({ ok: false, error: 'rate_limited', retryAfterSec: 30 });
    }

    const { code, expiresAt } = await createMagicCode({
      email,
      purpose: 'link',
      guestId: parsed.data.guestId,
      ip: req.ip,
    });

    req.log.info({ email, guestId: parsed.data.guestId, code }, 'magic link code generated');
    return {
      ok: true,
      expiresAt: expiresAt.toISOString(),
      // Em MVP sem provedor de e-mail, devolvemos código para teste.
      devCode: code,
    };
  });

  app.post('/api/auth/link/verify', async (req, reply) => {
    const parsed = VerifyLinkSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const email = normalizeEmail(parsed.data.email);
    if (!EMAIL_RE.test(email)) return reply.status(400).send({ ok: false, error: 'invalid_email' });

    const atKey = `${req.ip}:${email}:link`;
    if (tooManyAttempts(atKey)) return reply.status(429).send({ ok: false, error: 'too_many_attempts' });

    const consumed = await consumeCode({
      email,
      purpose: 'link',
      code: parsed.data.code,
      guestId: parsed.data.guestId,
    });

    if (!consumed.ok) return reply.status(400).send({ ok: false, error: consumed.error });

    let accountId: string;
    const existingAccount = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
    if (existingAccount.length) {
      accountId = existingAccount[0].id;
      await db.update(accounts).set({ lastSeenAt: new Date() }).where(eq(accounts.id, accountId));
    } else {
      accountId = crypto.randomUUID();
      await db.insert(accounts).values({ id: accountId, email, lastSeenAt: new Date() });
    }

    const existingByGuest = await db
      .select({ accountId: accountLinks.accountId })
      .from(accountLinks)
      .where(eq(accountLinks.guestId, parsed.data.guestId))
      .limit(1);

    if (existingByGuest.length && existingByGuest[0].accountId !== accountId) {
      return reply.status(409).send({ ok: false, error: 'guest_already_linked' });
    }

    await db
      .insert(accountLinks)
      .values({ accountId, guestId: parsed.data.guestId, linkedAt: new Date() })
      .onConflictDoNothing();

    const now = Date.now();
    const expMs = now + 60 * 60 * 1000;
    const token = signGuestToken({ guestId: parsed.data.guestId, expMs });

    return {
      ok: true,
      linked: true,
      accountId,
      guestId: parsed.data.guestId,
      token,
      tokenExpMs: expMs,
    };
  });

  app.post('/api/auth/login/start', async (req, reply) => {
    const parsed = StartLoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const email = normalizeEmail(parsed.data.email);
    if (!EMAIL_RE.test(email)) return reply.status(400).send({ ok: false, error: 'invalid_email' });

    const accRows = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
    if (!accRows.length) return reply.status(404).send({ ok: false, error: 'account_not_found' });

    const prev = await findLastCode(email, 'login');
    if (prev && Date.now() - new Date(prev.createdAt).getTime() < RESEND_COOLDOWN_MS) {
      return reply.status(429).send({ ok: false, error: 'rate_limited', retryAfterSec: 30 });
    }

    const { code, expiresAt } = await createMagicCode({ email, purpose: 'login', ip: req.ip });
    req.log.info({ email, code }, 'magic login code generated');

    return {
      ok: true,
      expiresAt: expiresAt.toISOString(),
      devCode: code,
    };
  });

  app.post('/api/auth/login/verify', async (req, reply) => {
    const parsed = VerifyLoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: 'invalid_body' });

    const email = normalizeEmail(parsed.data.email);
    if (!EMAIL_RE.test(email)) return reply.status(400).send({ ok: false, error: 'invalid_email' });

    const atKey = `${req.ip}:${email}:login`;
    if (tooManyAttempts(atKey)) return reply.status(429).send({ ok: false, error: 'too_many_attempts' });

    const consumed = await consumeCode({ email, purpose: 'login', code: parsed.data.code });
    if (!consumed.ok) return reply.status(400).send({ ok: false, error: consumed.error });

    const accRows = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
    if (!accRows.length) return reply.status(404).send({ ok: false, error: 'account_not_found' });

    const linkRows = await db
      .select({ guestId: accountLinks.guestId })
      .from(accountLinks)
      .where(eq(accountLinks.accountId, accRows[0].id))
      .limit(1);
    if (!linkRows.length) return reply.status(404).send({ ok: false, error: 'account_not_linked' });

    const guestId = linkRows[0].guestId;
    const now = Date.now();
    const expMs = now + 60 * 60 * 1000;
    const token = signGuestToken({ guestId, expMs });

    await db.update(accounts).set({ lastSeenAt: new Date() }).where(eq(accounts.id, accRows[0].id));
    await db.update(guests).set({ lastSeenAt: new Date() }).where(eq(guests.id, guestId));

    return {
      ok: true,
      accountId: accRows[0].id,
      guestId,
      token,
      tokenExpMs: expMs,
    };
  });
}
