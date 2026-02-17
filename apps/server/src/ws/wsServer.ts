import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { worldChunkState, chestState } from '../db/schema.js';
import { env } from '../env.js';
import { getRedis } from '../redis/client.js';
import crypto from 'node:crypto';

function mkRateLimiter({ ratePerSec, burst }: { ratePerSec: number; burst: number }) {
  // Token bucket
  let tokens = burst;
  let last = Date.now();
  return {
    allow(cost = 1) {
      const now = Date.now();
      const dt = Math.max(0, now - last);
      last = now;
      tokens = Math.min(burst, tokens + (dt / 1000) * ratePerSec);
      if (tokens < cost) return false;
      tokens -= cost;
      return true;
    },
  };
}

function base64urlToBuf(s: string) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function verifyGuestToken(token: string) {
  // token = base64url(payloadB64).base64url(sig)
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return { ok: false as const, error: 'invalid_format' as const };

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { ok: false as const, error: 'invalid_format' as const };

  const expected = crypto.createHmac('sha256', env.WOODCUTTER_WS_AUTH_SECRET).update(payloadB64).digest();
  const got = base64urlToBuf(sigB64);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
    return { ok: false as const, error: 'bad_signature' as const };
  }

  let payload: any;
  try {
    payload = JSON.parse(base64urlToBuf(payloadB64).toString('utf8'));
  } catch {
    return { ok: false as const, error: 'invalid_payload' as const };
  }

  const gid = String(payload?.gid || '');
  const exp = Number(payload?.exp);
  if (!gid) return { ok: false as const, error: 'invalid_payload' as const };
  if (!Number.isFinite(exp)) return { ok: false as const, error: 'invalid_payload' as const };
  if (Date.now() > exp) return { ok: false as const, error: 'expired' as const };

  return { ok: true as const, guestId: gid, expMs: exp };
}

type JoinMsg = {
  t: 'join';
  v: 1;
  /** Deprecated: server trusts id from token, not from this field. */
  guestId?: string;
  worldId: string;
  /** Short-lived token from POST /api/auth/guest */
  token: string;
  // Optional spawn hint (used to avoid snapping to default spawn after reconnect/teleport).
  spawn?: { x: number; y: number; z: number };
};

type ServerErrorMsg = {
  t: 'error';
  v: 1;
  code: 'auth_required' | 'auth_invalid' | 'auth_expired' | 'bad_join';
  message: string;
};
type InputMsg = {
  t: 'input';
  v: 1;
  seq: number;
  dt: number;
  keys: { w: boolean; a: boolean; s: boolean; d: boolean; sprint: boolean; jump: boolean };
  yaw: number;
  pitch: number;
  at: number;
};

type TeleportMsg = { t: 'teleport'; v: 1; x: number; y: number; z: number; at: number };

type WorldEventMsg =
  | { t: 'worldEvent'; v: 1; kind: 'treeCut'; treeId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'rockCollect'; rockId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'stickCollect'; stickId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'bushCollect'; bushId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'plotTill'; plotId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'plant'; plotId: string; seedId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'harvest'; plotId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'oreBreak'; oreId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'place'; placeKind: 'campfire' | 'forge' | 'forgeTable' | 'chest'; id: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'placeRemove'; placeKind: 'campfire' | 'forge' | 'forgeTable' | 'chest'; id: string; pickup: boolean; x: number; z: number; at: number };

type ClientMsg = JoinMsg | InputMsg | TeleportMsg | WorldEventMsg;

type PlayerState = {
  id: string;
  guestId: string;
  worldId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vy: number;
  onGround: boolean;

  lastAtMs: number;
  lastSeq: number;
  input?: InputMsg;
};

type ServerSnapshotMsg =
  | {
      t: 'snapshot';
      v: 1;
      worldId: string;
      players: Array<{ id: string; x: number; y: number; z: number; yaw: number }>;
    }
  | {
      // Compact form (optional): players as tuples to reduce payload size.
      // [id,x,y,z,yaw]
      t: 'snapshot';
      v: 1;
      c: 1;
      worldId: string;
      players: Array<[string, number, number, number, number]>;
    };

type ServerWelcomeMsg = { t: 'welcome'; v: 1; id: string; worldId: string };

type WorldEventResultMsg = {
  t: 'worldEventResult';
  v: 1;
  kind: WorldEventMsg['kind'];
  id: string;
  ok: boolean;
  reason?: 'already_removed' | 'invalid' | 'duplicate';
};

type WorldChunkMsg = {
  t: 'worldChunk';
  v: 1;
  worldId: string;
  chunkX: number;
  chunkZ: number;
  version: number;
  state: {
    removedTrees: string[];
    /** Active removals only (server-authoritative). */
    removedRocks: string[];
    removedSticks: string[];
    removedBushes: string[];
    removedOres: string[];
    placed: Array<{ id: string; type: 'campfire' | 'forge' | 'forgeTable' | 'chest'; x: number; z: number }>;
    farmPlots: Array<{ id: string; x: number; z: number; tilledAt: number; seedId?: string | null; plantedAt?: number | null; growMs?: number | null }>;
  };
};

type AnyWs = WebSocket & { __playerId?: string };

function safeJsonParse(data: any): any {
  try {
    if (typeof data === 'string') return JSON.parse(data);
    if (Buffer.isBuffer(data)) return JSON.parse(data.toString('utf8'));
    return null;
  } catch {
    return null;
  }
}

function createLogThrottle() {
  const last = new Map<string, number>();
  return {
    shouldLog(key: string, everyMs: number) {
      const now = Date.now();
      const prev = last.get(key) ?? 0;
      if (now - prev < everyMs) return false;
      last.set(key, now);
      return true;
    },
  };
}

function nowMs() {
  return Date.now();
}

export function registerWs(app: FastifyInstance, opts: { mpStats?: import('../mp/stats.js').MpStatsCollector } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const mpStats = opts.mpStats;
  const logThrottle = createLogThrottle();

  const redisP = getRedis();
  let redis: Awaited<typeof redisP> | null = null;
  redisP.then((c) => (redis = c)).catch(() => (redis = null));

  const REDIS_TTL_PLAYER_STATE_S = 15;
  const REDIS_TTL_ROOM_PLAYERS_S = 30;
  const REDIS_TTL_WORLD_EVENT_RL_S = 10;

  const keyPlayerState = (playerId: string) => `player:state:${playerId}`;
  const keyRoomPlayers = (worldId: string) => `room:${worldId}:players`;
  const keyWorldEventRatelimit = (worldId: string, playerId: string) => `rl:worldEvent:${worldId}:${playerId}`;

  const WORLD_EVENT_RL_LUA = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
if v > tonumber(ARGV[2]) then
  return 0
end
return 1
`;

  async function allowWorldEvent(worldId: string, playerId: string) {
    const r = redis;
    if (!r) return true; // best-effort: if Redis down, don't block gameplay

    const maxInWindow = env.WOODCUTTER_WORLD_EVENT_RATE_PER_SEC * REDIS_TTL_WORLD_EVENT_RL_S + env.WOODCUTTER_WORLD_EVENT_BURST;

    try {
      const res = await r.eval(WORLD_EVENT_RL_LUA, {
        keys: [keyWorldEventRatelimit(worldId, playerId)],
        arguments: [String(REDIS_TTL_WORLD_EVENT_RL_S), String(maxInWindow)],
      });
      return Number(res) === 1;
    } catch {
      return true;
    }
  }

  // Respawn rules (server-authoritative)
  const ROCK_RESPAWN_MS = 30_000;
  const STICK_RESPAWN_MS = 30_000;
  const BUSH_RESPAWN_MS = 120_000;
  const TREE_RESPAWN_MS = 45_000;
  const ORE_RESPAWN_MS = 120_000;

  // worldId:chunkX:chunkZ:<kind>:<id> -> timeout
  const respawnTimers = new Map<string, NodeJS.Timeout>();

  type RespawnKind = 'rock' | 'stick' | 'bush' | 'tree' | 'ore';

  /** playerId -> state (somente players conectados neste pod) */
  const players = new Map<string, PlayerState>();
  /** worldId -> set(playerId) (somente players conectados neste pod; usado para filtrar broadcasts) */
  const roomsLocal = new Map<string, Set<string>>();

  const chunkSize = 32;
  const chunkOf = (x: number, z: number) => ({
    cx: Math.floor(x / chunkSize),
    cz: Math.floor(z / chunkSize),
  });

  function chunkKey(worldId: string, chunkX: number, chunkZ: number) {
    return `${worldId}:${chunkX}:${chunkZ}`;
  }

  function timerKey(worldId: string, chunkX: number, chunkZ: number, kind: RespawnKind, id: string) {
    return `${worldId}:${chunkX}:${chunkZ}:${kind}:${id}`;
  }

  function normalizeRespawns(st: any, field: string, legacyRemovedField: string): Record<string, number> {
    const m = (st?.[field] ?? null) as any;
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(m)) {
        const id = String(k);
        const until = typeof v === 'number' && Number.isFinite(v) ? v : NaN;
        if (id && Number.isFinite(until)) out[id] = until;
      }
      return out;
    }

    // Legacy: removedX as string[] (treated as permanent removals)
    const legacy = Array.isArray(st?.[legacyRemovedField]) ? (st[legacyRemovedField] as any[]).map(String) : [];
    const out: Record<string, number> = {};
    for (const id of legacy) out[String(id)] = Number.POSITIVE_INFINITY;
    return out;
  }

  function activeRemoved(respawnUntil: Record<string, number>, t = nowMs()) {
    return Object.entries(respawnUntil)
      .filter(([, until]) => until > t)
      .map(([id]) => String(id));
  }

  // Redis: cache de chunk state (TTL 30m)
  const REDIS_TTL_CHUNK_CACHE_S = 30 * 60;
  const keyChunkCache = (worldId: string, chunkX: number, chunkZ: number) => `cache:chunk:${worldId}:${chunkX}:${chunkZ}`;

  // In-memory cache: placed colliders by chunk (for server-side collision)
  // key: worldId:chunkX:chunkZ
  const placedCollidersByChunk = new Map<string, Array<{ x: number; z: number; r: number }>>();
  const placedChunkKey = (worldId: string, chunkX: number, chunkZ: number) => `${worldId}:${chunkX}:${chunkZ}`;

  function placedCollidersFromRawState(rawState: any) {
    const st = (rawState ?? {}) as any;
    const placed = Array.isArray(st?.placed) ? st.placed : [];
    const out: Array<{ x: number; z: number; r: number }> = [];

    for (const p of placed) {
      const type = String(p?.type || '');
      if (!(type === 'campfire' || type === 'forge' || type === 'forgeTable' || type === 'chest')) continue;
      const x = Number(p?.x);
      const z = Number(p?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;

      // Approx radii should match client colliders.
      const r = type === 'chest' ? 0.9 : type === 'forge' ? 1.15 : type === 'forgeTable' ? 1.35 : 1.05;
      out.push({ x, z, r });
    }

    return out;
  }

  function getNearbyPlacedColliders(worldId: string, x: number, z: number) {
    const cs = 32;
    const cx0 = Math.floor(x / cs);
    const cz0 = Math.floor(z / cs);

    const out: Array<{ x: number; z: number; r: number }> = [];
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = cx0 + dx;
        const cz = cz0 + dz;
        const k = placedChunkKey(worldId, cx, cz);
        const arr = placedCollidersByChunk.get(k);
        if (arr && arr.length) out.push(...arr);
      }
    }
    return out;
  }

  function deriveChunk(params: { worldId: string; chunkX: number; chunkZ: number; version: number; rawState: any }) {
    const { worldId, chunkX, chunkZ, version } = params;
    const st = (params.rawState ?? {}) as any;

    const treeRespawnUntil = normalizeRespawns(st, 'treeRespawnUntil', 'removedTrees');
    const rockRespawnUntil = normalizeRespawns(st, 'rockRespawnUntil', 'removedRocks');
    const stickRespawnUntil = normalizeRespawns(st, 'stickRespawnUntil', 'removedSticks');
    const bushRespawnUntil = normalizeRespawns(st, 'bushRespawnUntil', 'removedBushes');
    const oreRespawnUntil = normalizeRespawns(st, 'oreRespawnUntil', 'removedOres');

    const farmRaw = (st?.farmPlots ?? null) as any;
    const farmPlots: Array<{ id: string; x: number; z: number; tilledAt: number; seedId?: string | null; plantedAt?: number | null; growMs?: number | null }> = [];
    if (farmRaw && typeof farmRaw === 'object' && !Array.isArray(farmRaw)) {
      for (const [k, v] of Object.entries(farmRaw)) {
        const id = String(k);
        const p = v as any;
        const x = Number(p?.x);
        const z = Number(p?.z);
        const tilledAt = Number(p?.tilledAt);
        if (!id || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(tilledAt)) continue;
        farmPlots.push({
          id,
          x,
          z,
          tilledAt,
          seedId: p?.seedId != null ? String(p.seedId) : null,
          plantedAt: p?.plantedAt != null ? Number(p.plantedAt) : null,
          growMs: p?.growMs != null ? Number(p.growMs) : null,
        });
      }
    }

    // Schedule respawn broadcasts for any timed entities in this chunk.
    const schedule = (kind: RespawnKind, id: string, until: number) => {
      if (!Number.isFinite(until) || until === Number.POSITIVE_INFINITY) return;
      const tk = timerKey(worldId, chunkX, chunkZ, kind, id);
      if (respawnTimers.has(tk)) return;
      const delay = Math.max(0, until - nowMs());
      const h = setTimeout(() => {
        respawnTimers.delete(tk);
        expireEntityIfNeeded({ worldId, chunkX, chunkZ, kind, id }).catch(() => null);
      }, delay);
      respawnTimers.set(tk, h);
    };

    for (const [id, until] of Object.entries(treeRespawnUntil)) schedule('tree', id, until);
    for (const [id, until] of Object.entries(rockRespawnUntil)) schedule('rock', id, until);
    for (const [id, until] of Object.entries(stickRespawnUntil)) schedule('stick', id, until);
    for (const [id, until] of Object.entries(bushRespawnUntil)) schedule('bush', id, until);
    for (const [id, until] of Object.entries(oreRespawnUntil)) schedule('ore', id, until);

    return {
      worldId,
      chunkX,
      chunkZ,
      version: Number(version ?? 0),
      // Full persisted state (used for writes).
      rawState: st,
      // Client-facing state (derived).
      state: {
        removedTrees: activeRemoved(treeRespawnUntil),
        removedRocks: activeRemoved(rockRespawnUntil),
        removedSticks: activeRemoved(stickRespawnUntil),
        removedBushes: activeRemoved(bushRespawnUntil),
        removedOres: activeRemoved(oreRespawnUntil),
        placed: Array.isArray(st.placed)
          ? st.placed
              .map((p: any) => ({ id: String(p?.id), type: p?.type, x: Number(p?.x), z: Number(p?.z) }))
              .filter((p: any) => p.id && (p.type === 'campfire' || p.type === 'forge' || p.type === 'forgeTable' || p.type === 'chest') && Number.isFinite(p.x) && Number.isFinite(p.z))
          : [],
        farmPlots,
      },
    };
  }

  const FARM_TILLED_DECAY_MS = 15 * 60_000;

  async function getChunk(worldId: string, chunkX: number, chunkZ: number) {
    const r = redis;
    if (r) {
      try {
        const cached = await r.get(keyChunkCache(worldId, chunkX, chunkZ));
        if (cached) {
          const parsed = JSON.parse(cached) as any;
          const version = Number(parsed?.version ?? 0);
          const rawState = (parsed?.state ?? {}) as any;
          return deriveChunk({ worldId, chunkX, chunkZ, version, rawState });
        }
      } catch {
        // ignore cache errors
      }
    }

    const row = await db
      .select()
      .from(worldChunkState)
      .where(and(eq(worldChunkState.worldId, worldId), eq(worldChunkState.chunkX, chunkX), eq(worldChunkState.chunkZ, chunkZ)))
      .limit(1);

    if (row[0]) {
      let version = Number(row[0].version ?? 0);
      let rawState = (row[0].state ?? {}) as any;

      // Farm decay: tilled plots with no seed revert to normal after 15 min (offline too).
      try {
        const farm = rawState?.farmPlots;
        if (farm && typeof farm === 'object' && !Array.isArray(farm)) {
          const now = nowMs();
          let changed = false;
          const nextFarm: any = { ...farm };
          for (const [k, v] of Object.entries(farm)) {
            const p = v as any;
            const tilledAt = Number(p?.tilledAt);
            const seedId = p?.seedId != null ? String(p.seedId) : null;
            if (!Number.isFinite(tilledAt)) continue;
            if (seedId) continue;
            if (now - tilledAt >= FARM_TILLED_DECAY_MS) {
              delete nextFarm[String(k)];
              changed = true;
            }
          }
          if (changed) {
            version = version + 1;
            const next = structuredClone(rawState) as any;
            next.farmPlots = nextFarm;
            await saveChunk({ worldId, chunkX, chunkZ, version, state: next });
            rawState = next;
          }
        }
      } catch {
        // ignore
      }

      if (r) {
        try {
          void r.set(keyChunkCache(worldId, chunkX, chunkZ), JSON.stringify({ version, state: rawState }), { EX: REDIS_TTL_CHUNK_CACHE_S });
        } catch {
          // ignore
        }
      }

      // Update in-memory placed collider cache.
      try {
        placedCollidersByChunk.set(placedChunkKey(worldId, chunkX, chunkZ), placedCollidersFromRawState(rawState));
      } catch {
        // ignore
      }

      return deriveChunk({ worldId, chunkX, chunkZ, version, rawState });
    }

    // Create empty chunk row.
    await db.insert(worldChunkState).values({ worldId, chunkX, chunkZ, version: 0, state: {} });

    if (r) {
      try {
        void r.set(keyChunkCache(worldId, chunkX, chunkZ), JSON.stringify({ version: 0, state: {} }), { EX: REDIS_TTL_CHUNK_CACHE_S });
      } catch {
        // ignore
      }
    }

    try {
      placedCollidersByChunk.set(placedChunkKey(worldId, chunkX, chunkZ), []);
    } catch {
      // ignore
    }

    return deriveChunk({ worldId, chunkX, chunkZ, version: 0, rawState: {} });
  }

  async function expireEntityIfNeeded(params: { worldId: string; chunkX: number; chunkZ: number; kind: RespawnKind; id: string }) {
    const { worldId, chunkX, chunkZ, kind, id } = params;

    const row = await db
      .select()
      .from(worldChunkState)
      .where(and(eq(worldChunkState.worldId, worldId), eq(worldChunkState.chunkX, chunkX), eq(worldChunkState.chunkZ, chunkZ)))
      .limit(1);

    if (!row[0]) return;

    const st = (row[0].state ?? {}) as any;

    const field = kind === 'tree' ? 'treeRespawnUntil' : kind === 'rock' ? 'rockRespawnUntil' : kind === 'stick' ? 'stickRespawnUntil' : kind === 'bush' ? 'bushRespawnUntil' : 'oreRespawnUntil';
    const legacyField = kind === 'tree' ? 'removedTrees' : kind === 'rock' ? 'removedRocks' : kind === 'stick' ? 'removedSticks' : kind === 'bush' ? 'removedBushes' : 'removedOres';

    const respawnUntil = normalizeRespawns(st, field, legacyField);

    const until = respawnUntil[String(id)];
    if (until == null) return;
    if (until > nowMs()) return; // not yet

    delete respawnUntil[String(id)];

    const version = Number(row[0].version ?? 0) + 1;
    const next = structuredClone(st) as any;
    next[field] = respawnUntil;
    // stop writing legacy permanent fields going forward
    next[legacyField] = [];

    await saveChunk({ worldId, chunkX, chunkZ, version, state: next });

    const treeRespawnUntil = normalizeRespawns(next, 'treeRespawnUntil', 'removedTrees');
    const rockRespawnUntil = normalizeRespawns(next, 'rockRespawnUntil', 'removedRocks');
    const stickRespawnUntil = normalizeRespawns(next, 'stickRespawnUntil', 'removedSticks');
    const bushRespawnUntil = normalizeRespawns(next, 'bushRespawnUntil', 'removedBushes');
    const oreRespawnUntil = normalizeRespawns(next, 'oreRespawnUntil', 'removedOres');

    const out: WorldChunkMsg = {
      t: 'worldChunk',
      v: 1,
      worldId,
      chunkX,
      chunkZ,
      version,
      state: {
        removedTrees: activeRemoved(treeRespawnUntil),
        removedRocks: activeRemoved(rockRespawnUntil),
        removedSticks: activeRemoved(stickRespawnUntil),
        removedBushes: activeRemoved(bushRespawnUntil),
        removedOres: activeRemoved(oreRespawnUntil),
        placed: Array.isArray(next.placed) ? next.placed : [],
        farmPlots: Object.entries(next.farmPlots || {})
          .map(([id, p]: any) => ({
            id: String(id),
            x: Number(p?.x),
            z: Number(p?.z),
            tilledAt: Number(p?.tilledAt),
            seedId: p?.seedId != null ? String(p.seedId) : null,
            plantedAt: p?.plantedAt != null ? Number(p.plantedAt) : null,
            growMs: p?.growMs != null ? Number(p.growMs) : null,
          }))
          .filter((p: any) => p.id && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.tilledAt)),
      },
    };

    broadcastWorldChunk(worldId, chunkX, chunkZ, out);
  }

  async function saveChunk(next: { worldId: string; chunkX: number; chunkZ: number; version: number; state: any }) {
    await db
      .insert(worldChunkState)
      .values({
        worldId: next.worldId,
        chunkX: next.chunkX,
        chunkZ: next.chunkZ,
        version: next.version,
        state: next.state,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [worldChunkState.worldId, worldChunkState.chunkX, worldChunkState.chunkZ],
        set: { version: next.version, state: next.state, updatedAt: new Date() },
      });

    // Redis cache update/invalidation (best-effort)
    if (redis) {
      try {
        void redis.set(keyChunkCache(next.worldId, next.chunkX, next.chunkZ), JSON.stringify({ version: next.version, state: next.state }), { EX: REDIS_TTL_CHUNK_CACHE_S });
      } catch {
        // ignore
      }
    }

    try {
      placedCollidersByChunk.set(placedChunkKey(next.worldId, next.chunkX, next.chunkZ), placedCollidersFromRawState(next.state));
    } catch {
      // ignore
    }
  }

  function broadcastWorldChunk(worldId: string, chunkX: number, chunkZ: number, msg: WorldChunkMsg) {
    const txt = JSON.stringify(msg);
    for (const client of wss.clients) {
      const ws = client as AnyWs;
      const pid = ws.__playerId;
      if (!pid) continue;
      const st = players.get(pid);
      if (!st || st.worldId !== worldId) continue;
      if (ws.readyState === ws.OPEN) ws.send(txt);
    }
  }

  async function broadcastSnapshot(worldId: string) {
    const local = roomsLocal.get(worldId);
    if (!local || local.size === 0) return;

    const r = redis;
    if (!r) return;

    const round2 = (n: number) => Math.round(n * 100) / 100;

    let ids: string[] = [];
    try {
      ids = (await r.sMembers(keyRoomPlayers(worldId))).map(String);
    } catch {
      return;
    }
    if (!ids.length) return;

    const keys = ids.map((id) => keyPlayerState(id));

    let rawStates: Array<string | null> = [];
    try {
      rawStates = await r.mGet(keys);
    } catch {
      return;
    }

    const parsed = rawStates
      .map((s) => {
        if (!s) return null;
        try {
          return JSON.parse(s) as any;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ id: string; x: number; y: number; z: number; yaw: number }>;

    const payload: ServerSnapshotMsg = env.WOODCUTTER_SNAPSHOT_COMPACT
      ? {
          t: 'snapshot',
          v: 1,
          c: 1,
          worldId,
          players: parsed
            .filter((p) => p && typeof p.id === 'string')
            .map((p) => [String(p.id), round2(Number(p.x) || 0), round2(Number(p.y) || 0), round2(Number(p.z) || 0), round2(Number(p.yaw) || 0)] as [string, number, number, number, number]),
        }
      : {
          t: 'snapshot',
          v: 1,
          worldId,
          players: parsed
            .filter((p) => p && typeof p.id === 'string')
            .map((p) => ({ id: String(p.id), x: round2(Number(p.x) || 0), y: round2(Number(p.y) || 0), z: round2(Number(p.z) || 0), yaw: round2(Number(p.yaw) || 0) })),
        };

    const txt = JSON.stringify(payload);
    for (const client of wss.clients) {
      const ws = client as AnyWs;
      const pid = ws.__playerId;
      if (!pid) continue;
      const st = players.get(pid);
      if (!st || st.worldId !== worldId) continue;
      if (ws.readyState === ws.OPEN) ws.send(txt);
    }
  }

  type Collider = { x: number; z: number; r: number };

  function buildWorldBoundaryColliders(): Collider[] {
    // Macro collision only: prevents leaving the map area.
    // Matches client river boundary roughly: radius ~96.
    const out: Collider[] = [];
    const radius = 96;
    const n = 220;
    const bandA = { off: -1.4, r: 1.35 };
    const bandB = { off: -2.8, r: 1.05 };

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const x = nx * radius;
      const z = nz * radius;
      out.push({ x: x + nx * bandA.off, z: z + nz * bandA.off, r: bandA.r });
      out.push({ x: x + nx * bandB.off, z: z + nz * bandB.off, r: bandB.r });
    }
    return out;
  }

  const worldBoundaryColliders = buildWorldBoundaryColliders();

  // ---- Mine collision (server-side) ----
  // Must match client MineManager (mineOrigin + curve points + collider generation).
  const MINE_ORIGIN = { x: -120, z: 95 };
  const MINE_TENSION = 0.22;
  const MINE_TUNNEL_RADIUS = 2.3;
  const MINE_WALL_R = 0.85;
  const MINE_OFF = MINE_TUNNEL_RADIUS - 0.35;

  const MINE_CTRL = [
    { x: MINE_ORIGIN.x + 1.0, z: MINE_ORIGIN.z + 0.0 },
    { x: MINE_ORIGIN.x + 9.0, z: MINE_ORIGIN.z + 2.2 },
    { x: MINE_ORIGIN.x + 18.0, z: MINE_ORIGIN.z + 8.2 },
    { x: MINE_ORIGIN.x + 30.0, z: MINE_ORIGIN.z + 3.4 },
    { x: MINE_ORIGIN.x + 42.0, z: MINE_ORIGIN.z - 4.8 },
    { x: MINE_ORIGIN.x + 56.0, z: MINE_ORIGIN.z - 1.6 },
    { x: MINE_ORIGIN.x + 68.0, z: MINE_ORIGIN.z + 6.0 },
  ];

  function hermite(p1: any, p2: any, m1: any, m2: any, t: number) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return {
      x: h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
      z: h00 * p1.z + h10 * m1.z + h01 * p2.z + h11 * m2.z,
    };
  }

  function hermiteTangent(p1: any, p2: any, m1: any, m2: any, t: number) {
    const t2 = t * t;
    const dh00 = 6 * t2 - 6 * t;
    const dh10 = 3 * t2 - 4 * t + 1;
    const dh01 = -6 * t2 + 6 * t;
    const dh11 = 3 * t2 - 2 * t;
    return {
      x: dh00 * p1.x + dh10 * m1.x + dh01 * p2.x + dh11 * m2.x,
      z: dh00 * p1.z + dh10 * m1.z + dh01 * p2.z + dh11 * m2.z,
    };
  }

  function minePointAt(t: number) {
    const pts = MINE_CTRL;
    const n = pts.length;
    const segs = n - 1;
    const u = Math.max(0, Math.min(1, t)) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const lt = u - i;

    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];

    const m1 = { x: (p2.x - p0.x) * MINE_TENSION, z: (p2.z - p0.z) * MINE_TENSION };
    const m2 = { x: (p3.x - p1.x) * MINE_TENSION, z: (p3.z - p1.z) * MINE_TENSION };

    const p = hermite(p1, p2, m1, m2, lt);
    const tan = hermiteTangent(p1, p2, m1, m2, lt);
    return { p, tan };
  }

  function norm2(v: any) {
    const d = Math.hypot(v.x, v.z) || 1;
    return { x: v.x / d, z: v.z / d };
  }

  function buildMineColliders() {
    const out: Array<{ x: number; z: number; r: number }> = [];
    const samples = 26;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const { p, tan } = minePointAt(t);
      const side = norm2({ x: tan.z, z: -tan.x });
      out.push({ x: p.x + side.x * MINE_OFF, z: p.z + side.z * MINE_OFF, r: MINE_WALL_R });
      out.push({ x: p.x - side.x * MINE_OFF, z: p.z - side.z * MINE_OFF, r: MINE_WALL_R });

      if (i < samples) {
        const t2 = (i + 0.5) / samples;
        const { p: p2, tan: tan2 } = minePointAt(t2);
        const side2 = norm2({ x: tan2.z, z: -tan2.x });
        out.push({ x: p2.x + side2.x * MINE_OFF, z: p2.z + side2.z * MINE_OFF, r: MINE_WALL_R });
        out.push({ x: p2.x - side2.x * MINE_OFF, z: p2.z - side2.z * MINE_OFF, r: MINE_WALL_R });
      }
    }

    const end = minePointAt(1).p;
    out.push({ x: end.x, z: end.z, r: 2.2 });

    out.push({ x: MINE_ORIGIN.x + 1.0, z: MINE_ORIGIN.z + 2.4, r: 0.8 });
    out.push({ x: MINE_ORIGIN.x + 1.0, z: MINE_ORIGIN.z - 2.4, r: 0.8 });

    return out;
  }

  const mineColliders = buildMineColliders();

  function isInMineXZ(x: number, z: number) {
    // Bounding box around mine corridors (rough, but fast)
    return x >= MINE_ORIGIN.x - 10 && x <= MINE_ORIGIN.x + 85 && z >= MINE_ORIGIN.z - 25 && z <= MINE_ORIGIN.z + 30;
  }

  function resolveCollisionsXZ(next: { x: number; z: number }, colliders: Collider[], radius: number) {
    for (let iter = 0; iter < 6; iter++) {
      let any = false;
      for (const c of colliders) {
        const dx = next.x - c.x;
        const dz = next.z - c.z;
        const rr = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const pen = rr - d;
        const nx = dx / d;
        const nz = dz / d;
        next.x += nx * pen;
        next.z += nz * pen;
        any = true;
      }
      if (!any) break;
    }
  }

  function stepPlayer(st: PlayerState, dt: number) {
    const eyeHeight = 1.65;
    const groundY = 0;
    const gravity = -18;
    const jumpSpeed = 6.4;
    const baseSpeed = 6.0;
    const sprintMult = 1.65;
    const capsuleR = 0.35;

    const inp = st.input;
    // If no fresh input recently, treat as idle (prevents drifting/stuck keys on reconnect).
    if (inp && nowMs() - st.lastAtMs > 300) {
      st.input = undefined;
    }

    const placedColliders = !isInMineXZ(st.x, st.z) ? getNearbyPlacedColliders(st.worldId, st.x, st.z) : [];

    if (st.input) {
      const inp2 = st.input;
      st.yaw = inp2!.yaw;
      st.pitch = inp2!.pitch;

      const forward = Number(inp2!.keys.s) - Number(inp2!.keys.w);
      const strafe = Number(inp2!.keys.d) - Number(inp2!.keys.a);

      // normalize
      let dx = strafe;
      let dz = forward;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) {
        dx /= len;
        dz /= len;
      }

      // rotate by yaw (match Three.js Matrix4 RotationY)
      // x' = x*cos + z*sin
      // z' = -x*sin + z*cos
      const cy = Math.cos(st.yaw);
      const sy = Math.sin(st.yaw);
      const rx = dx * cy + dz * sy;
      const rz = -dx * sy + dz * cy;

      const moving = len > 0.001;
      const speed = baseSpeed * (inp2!.keys.sprint && moving ? sprintMult : 1.0);

      st.x += rx * speed * dt;
      st.z += rz * speed * dt;

      // Collision: keep within boundary + placed structures (server-authoritative) + mine walls.
      resolveCollisionsXZ(st, worldBoundaryColliders, capsuleR);
      if (placedColliders.length) resolveCollisionsXZ(st, placedColliders, capsuleR);
      if (isInMineXZ(st.x, st.z)) resolveCollisionsXZ(st, mineColliders, capsuleR);

      // jump (edge on client; server trusts boolean)
      if (inp2!.keys.jump && st.onGround) {
        st.vy = jumpSpeed;
        st.onGround = false;
      }
    }

    st.vy += gravity * dt;
    st.y += st.vy * dt;

    const minY = groundY + eyeHeight;
    if (st.y <= minY) {
      st.y = minY;
      st.vy = 0;
      st.onGround = true;
    } else {
      st.onGround = false;
    }
  }

  // Tick: simulate + snapshots (20Hz sim, 10Hz snapshot)
  let acc = 0;
  const simHz = 20;
  const simDt = 1 / simHz;

  let snapAcc = 0;
  const snapHz = 20;
  const snapDt = 1 / snapHz;

  const interval = setInterval(() => {
    const dt = simDt;
    acc += dt;
    snapAcc += dt;

    // Sim step
    for (const st of players.values()) {
      stepPlayer(st, dt);
    }

    // Persist volatile player state to Redis (TTL-renewal in tick)
    if (redis) {
      try {
        const m = redis.multi();
        for (const st of players.values()) {
          const payload = {
            id: st.id,
            worldId: st.worldId,
            x: st.x,
            y: st.y,
            z: st.z,
            yaw: st.yaw,
            pitch: st.pitch,
            vy: st.vy,
            onGround: st.onGround,
            lastAtMs: st.lastAtMs,
            lastSeq: st.lastSeq,
          };
          m.set(keyPlayerState(st.id), JSON.stringify(payload), { EX: REDIS_TTL_PLAYER_STATE_S });
        }
        void m.exec();
      } catch {
        // best-effort
      }
    }

    // Snapshot step
    if (snapAcc >= snapDt) {
      snapAcc = 0;
      for (const worldId of roomsLocal.keys()) void broadcastSnapshot(worldId);
    }
  }, Math.floor(1000 / simHz));

  app.addHook('onClose', async () => {
    clearInterval(interval);
    wss.close();
  });

  wss.on('connection', (ws: AnyWs, req: any) => {
    const remoteAddress = String(req?.socket?.remoteAddress || '');
    mpStats?.onConnOpen();
    app.log.info({ event: 'ws_open', remoteAddress }, 'ws connection opened');

    // WorldEvent rate limit: multi-pod safe via Redis (fallback: local token bucket).
    const worldEventLimiter = mkRateLimiter({
      ratePerSec: env.WOODCUTTER_WORLD_EVENT_RATE_PER_SEC,
      burst: env.WOODCUTTER_WORLD_EVENT_BURST,
    });

    ws.on('message', (raw) => {
      const msg = safeJsonParse(raw) as ClientMsg | null;
      if (!msg || typeof msg !== 'object') {
        if (logThrottle.shouldLog(`bad_json:${remoteAddress}`, 1000)) {
          app.log.warn({ event: 'ws_bad_json', remoteAddress }, 'ws invalid json');
        }
        return;
      }

      if (msg.t === 'join') {
        if (msg.v !== 1) return;
        if (!msg.worldId) {
          app.log.warn({ event: 'ws_join_reject', remoteAddress, reason: 'missing_worldId' }, 'ws join rejected');
          const err: ServerErrorMsg = { t: 'error', v: 1, code: 'bad_join', message: 'missing worldId' };
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(err));
          try { ws.close(); } catch {}
          return;
        }
        if (!msg.token) {
          app.log.warn({ event: 'ws_join_reject', remoteAddress, reason: 'missing_token', worldId: msg.worldId }, 'ws join rejected');
          const err: ServerErrorMsg = { t: 'error', v: 1, code: 'auth_required', message: 'missing token' };
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(err));
          try { ws.close(); } catch {}
          return;
        }

        const vtok = verifyGuestToken(String(msg.token));
        if (!vtok.ok) {
          const code: ServerErrorMsg['code'] = vtok.error === 'expired' ? 'auth_expired' : 'auth_invalid';
          app.log.warn({ event: 'ws_join_reject', remoteAddress, reason: code, worldId: msg.worldId }, 'ws join rejected');
          const err: ServerErrorMsg = { t: 'error', v: 1, code, message: 'invalid token' };
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(err));
          try { ws.close(); } catch {}
          return;
        }

        const id = vtok.guestId;
        ws.__playerId = id;

        const existing = players.get(id);
        const st: PlayerState = existing ?? {
          id,
          guestId: id,
          worldId: msg.worldId,
          x: 0,
          y: 1.65,
          z: 6,
          yaw: 0,
          pitch: 0,
          vy: 0,
          onGround: true,
          lastAtMs: nowMs(),
          lastSeq: 0,
        };
        st.worldId = msg.worldId;
        st.lastAtMs = nowMs();

        // Reset sequencing/input on join (important on reconnect/page refresh).
        // Client seq restarts at 1; if we keep an old lastSeq, we would ignore all inputs
        // and the client would rubber-band back to spawn.
        st.lastSeq = 0;
        st.input = undefined;

        // Apply optional spawn hint.
        if (msg.spawn && Number.isFinite(msg.spawn.x) && Number.isFinite(msg.spawn.y) && Number.isFinite(msg.spawn.z)) {
          st.x = msg.spawn.x;
          st.y = msg.spawn.y;
          st.z = msg.spawn.z;
        }

        players.set(id, st);

        // Redis: write initial player state (so other pods/clients can see immediately)
        if (redis) {
          try {
            const payload = {
              id: st.id,
              worldId: st.worldId,
              x: st.x,
              y: st.y,
              z: st.z,
              yaw: st.yaw,
              pitch: st.pitch,
              vy: st.vy,
              onGround: st.onGround,
              lastAtMs: st.lastAtMs,
              lastSeq: st.lastSeq,
            };
            void redis.set(keyPlayerState(st.id), JSON.stringify(payload), { EX: REDIS_TTL_PLAYER_STATE_S });
          } catch {
            // best-effort
          }
        }

        if (!roomsLocal.has(msg.worldId)) roomsLocal.set(msg.worldId, new Set());
        roomsLocal.get(msg.worldId)!.add(id);

        // Redis: membership (TTL-renewal on join)
        if (redis) {
          try {
            void redis
              .multi()
              .sAdd(keyRoomPlayers(msg.worldId), id)
              .expire(keyRoomPlayers(msg.worldId), REDIS_TTL_ROOM_PLAYERS_S)
              .exec();
          } catch {
            // best-effort
          }
        }

        mpStats?.onJoin(msg.worldId);
        app.log.info({ event: 'ws_join', remoteAddress, worldId: msg.worldId, playerId: id }, 'ws player joined');

        const welcome: ServerWelcomeMsg = { t: 'welcome', v: 1, id, worldId: msg.worldId };
        ws.send(JSON.stringify(welcome));

        // Send initial world chunks around spawn.
        const sx = msg.spawn?.x ?? st.x;
        const sz = msg.spawn?.z ?? st.z;
        const { cx, cz } = chunkOf(Number(sx) || 0, Number(sz) || 0);
        const radius = 1;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            getChunk(st.worldId, cx + dx, cz + dz)
              .then((c) => {
                const out: WorldChunkMsg = {
                  t: 'worldChunk',
                  v: 1,
                  worldId: st.worldId,
                  chunkX: c.chunkX,
                  chunkZ: c.chunkZ,
                  version: c.version,
                  state: c.state,
                };
                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(out));
              })
              .catch(() => null);
          }
        }

        return;
      }

      if (msg.t === 'worldEvent') {
        const pid = ws.__playerId;
        if (!pid) return;
        const st = players.get(pid);
        if (!st) return;
        if (msg.v !== 1) return;

        // Redis limiter is async; handle worldEvent in a detached async flow.
        void (async () => {
          const allowedRedis = await allowWorldEvent(st.worldId, pid);
          const allowedLocal = worldEventLimiter.allow(1);
          if (!(allowedRedis && allowedLocal)) {
            if (logThrottle.shouldLog(`rate:${pid}`, 1000)) {
              app.log.warn({ event: 'ws_worldEvent_throttled', remoteAddress, worldId: st.worldId, playerId: pid }, 'worldEvent throttled');
            }
            const id =
              (msg.kind === 'treeCut' ? String((msg as any).treeId || '') :
              msg.kind === 'rockCollect' ? String((msg as any).rockId || '') :
              msg.kind === 'stickCollect' ? String((msg as any).stickId || '') :
              msg.kind === 'bushCollect' ? String((msg as any).bushId || '') :
              msg.kind === 'plotTill' ? String((msg as any).plotId || '') :
              msg.kind === 'plant' ? String((msg as any).plotId || '') :
              msg.kind === 'harvest' ? String((msg as any).plotId || '') :
              msg.kind === 'placeRemove' ? String((msg as any).id || '') :
              msg.kind === 'oreBreak' ? String((msg as any).oreId || '') :
              String((msg as any).id || ''));

            const out: WorldEventResultMsg = { t: 'worldEventResult', v: 1, kind: msg.kind, id, ok: false, reason: 'invalid' };
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(out));
            return;
          }

        const clampNum = (n: any) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

        const x = 'x' in msg ? clampNum((msg as any).x) : null;
        const z = 'z' in msg ? clampNum((msg as any).z) : null;
        if (x == null || z == null) return;

        // Basic reach validation: the event must be near the server-authoritative player position.
        const dxp = x - st.x;
        const dzp = z - st.z;
        const dist = Math.hypot(dxp, dzp);
        if (!(dist <= env.WOODCUTTER_WORLD_EVENT_RADIUS)) {
          if (logThrottle.shouldLog(`far:${pid}`, 1000)) {
            app.log.warn({ event: 'ws_worldEvent_reject_far', remoteAddress, worldId: st.worldId, playerId: pid, dist }, 'worldEvent rejected (too far)');
          }

          const id =
            (msg.kind === 'treeCut' ? String((msg as any).treeId || '') :
            msg.kind === 'rockCollect' ? String((msg as any).rockId || '') :
            msg.kind === 'stickCollect' ? String((msg as any).stickId || '') :
            msg.kind === 'bushCollect' ? String((msg as any).bushId || '') :
            msg.kind === 'plotTill' ? String((msg as any).plotId || '') :
            msg.kind === 'plant' ? String((msg as any).plotId || '') :
            msg.kind === 'harvest' ? String((msg as any).plotId || '') :
            msg.kind === 'placeRemove' ? String((msg as any).id || '') :
            msg.kind === 'oreBreak' ? String((msg as any).oreId || '') :
            String((msg as any).id || ''));

          const out: WorldEventResultMsg = { t: 'worldEventResult', v: 1, kind: msg.kind, id, ok: false, reason: 'invalid' };
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(out));
          return;
        }

        const { cx, cz } = chunkOf(x, z);

        getChunk(st.worldId, cx, cz)
          .then(async (chunk) => {
            // IMPORTANT: start from full persisted state, not the derived client-facing arrays.
            const next = structuredClone(chunk.rawState ?? {}) as any;
            next.removedTrees = Array.isArray(next.removedTrees) ? next.removedTrees.map(String) : [];
            next.removedOres = Array.isArray(next.removedOres) ? next.removedOres.map(String) : [];
            next.placed = Array.isArray(next.placed) ? next.placed : [];

            // Respawns are timed & server-authoritative.
            const treeRespawnUntil = normalizeRespawns(next, 'treeRespawnUntil', 'removedTrees');
            const rockRespawnUntil = normalizeRespawns(next, 'rockRespawnUntil', 'removedRocks');
            const stickRespawnUntil = normalizeRespawns(next, 'stickRespawnUntil', 'removedSticks');
            const bushRespawnUntil = normalizeRespawns(next, 'bushRespawnUntil', 'removedBushes');
            const oreRespawnUntil = normalizeRespawns(next, 'oreRespawnUntil', 'removedOres');

            // Farming plots (persisted in chunk state)
            next.farmPlots = (next.farmPlots && typeof next.farmPlots === 'object' && !Array.isArray(next.farmPlots)) ? next.farmPlots : {};

            const schedule = (kind: RespawnKind, id: string, delayMs: number) => {
              const tk = timerKey(st.worldId, cx, cz, kind, id);
              if (respawnTimers.has(tk)) return;
              const h = setTimeout(() => {
                respawnTimers.delete(tk);
                expireEntityIfNeeded({ worldId: st.worldId, chunkX: cx, chunkZ: cz, kind, id }).catch(() => null);
              }, delayMs);
              respawnTimers.set(tk, h);
            };

            const t = nowMs();
            let result: WorldEventResultMsg | null = null;

            const setResult = (kind: WorldEventResultMsg['kind'], id: string, ok: boolean, reason?: WorldEventResultMsg['reason']) => {
              result = { t: 'worldEventResult', v: 1, kind, id, ok, reason };
            };

            if (msg.kind === 'treeCut') {
              const id = String((msg as any).treeId || '');
              if (!id) {
                setResult('treeCut', '', false, 'invalid');
              } else if ((treeRespawnUntil[id] ?? 0) > t) {
                setResult('treeCut', id, false, 'already_removed');
              } else {
                const until = t + TREE_RESPAWN_MS;
                treeRespawnUntil[id] = until;
                next.treeRespawnUntil = treeRespawnUntil;
                next.removedTrees = [];
                schedule('tree', id, TREE_RESPAWN_MS);
                setResult('treeCut', id, true);
              }
            } else if (msg.kind === 'rockCollect') {
              const id = String((msg as any).rockId || '');
              if (!id) {
                setResult('rockCollect', '', false, 'invalid');
              } else if ((rockRespawnUntil[id] ?? 0) > t) {
                setResult('rockCollect', id, false, 'already_removed');
              } else {
                const until = t + ROCK_RESPAWN_MS;
                rockRespawnUntil[id] = until;
                next.rockRespawnUntil = rockRespawnUntil;
                next.removedRocks = [];
                schedule('rock', id, ROCK_RESPAWN_MS);
                setResult('rockCollect', id, true);
              }
            } else if (msg.kind === 'stickCollect') {
              const id = String((msg as any).stickId || '');
              if (!id) {
                setResult('stickCollect', '', false, 'invalid');
              } else if ((stickRespawnUntil[id] ?? 0) > t) {
                setResult('stickCollect', id, false, 'already_removed');
              } else {
                const until = t + STICK_RESPAWN_MS;
                stickRespawnUntil[id] = until;
                next.stickRespawnUntil = stickRespawnUntil;
                next.removedSticks = [];
                schedule('stick', id, STICK_RESPAWN_MS);
                setResult('stickCollect', id, true);
              }
            } else if (msg.kind === 'bushCollect') {
              const id = String((msg as any).bushId || '');
              if (!id) {
                setResult('bushCollect', '', false, 'invalid');
              } else if ((bushRespawnUntil[id] ?? 0) > t) {
                setResult('bushCollect', id, false, 'already_removed');
              } else {
                const until = t + BUSH_RESPAWN_MS;
                bushRespawnUntil[id] = until;
                next.bushRespawnUntil = bushRespawnUntil;
                next.removedBushes = [];
                schedule('bush', id, BUSH_RESPAWN_MS);
                setResult('bushCollect', id, true);
              }
            } else if (msg.kind === 'plotTill') {
              const plotId = String((msg as any).plotId || '');
              if (!plotId) {
                setResult('plotTill', '', false, 'invalid');
              } else {
                const x0 = Number(x);
                const z0 = Number(z);
                const tx = Math.round(x0);
                const tz = Math.round(z0);
                const id = `${tx}:${tz}`;

                // Ensure client can't spoof plotId away from coords.
                if (plotId !== id) {
                  setResult('plotTill', plotId, false, 'invalid');
                } else {
                  // Create/refresh tilled plot. Overwrite planted state.
                  next.farmPlots[id] = {
                    x: tx,
                    z: tz,
                    tilledAt: t,
                    seedId: null,
                    plantedAt: null,
                    growMs: null,
                  };
                  setResult('plotTill', id, true);
                }
              }
            } else if (msg.kind === 'plant') {
              const plotId = String((msg as any).plotId || '');
              const seedId = String((msg as any).seedId || '');
              if (!plotId || !seedId) {
                setResult('plant', plotId || '', false, 'invalid');
              } else {
                const p = next.farmPlots?.[plotId];
                if (!p) {
                  setResult('plant', plotId, false, 'invalid');
                } else if (p.seedId) {
                  // already planted
                  setResult('plant', plotId, false, 'duplicate');
                } else {
                  // Growth: 5-8 minutes (ms)
                  const growMs = (5 * 60_000) + Math.floor(Math.random() * (3 * 60_000 + 1));
                  next.farmPlots[plotId] = {
                    ...p,
                    seedId,
                    plantedAt: t,
                    growMs,
                  };
                  setResult('plant', plotId, true);
                }
              }
            } else if (msg.kind === 'harvest') {
              const plotId = String((msg as any).plotId || '');
              if (!plotId) {
                setResult('harvest', '', false, 'invalid');
              } else {
                const p = next.farmPlots?.[plotId];
                if (!p || !p.seedId || !p.plantedAt || !p.growMs) {
                  setResult('harvest', plotId, false, 'invalid');
                } else {
                  const readyAt = Number(p.plantedAt) + Number(p.growMs);
                  if (readyAt > t) {
                    setResult('harvest', plotId, false, 'invalid');
                  } else {
                    // Clear plant, keep tilled.
                    next.farmPlots[plotId] = {
                      ...p,
                      seedId: null,
                      plantedAt: null,
                      growMs: null,
                    };
                    setResult('harvest', plotId, true);
                  }
                }
              }
            } else if (msg.kind === 'oreBreak') {
              const id = String((msg as any).oreId || '');
              if (!id) {
                setResult('oreBreak', '', false, 'invalid');
              } else if ((oreRespawnUntil[id] ?? 0) > t) {
                setResult('oreBreak', id, false, 'already_removed');
              } else {
                const until = t + ORE_RESPAWN_MS;
                oreRespawnUntil[id] = until;
                next.oreRespawnUntil = oreRespawnUntil;
                next.removedOres = [];
                schedule('ore', id, ORE_RESPAWN_MS);
                setResult('oreBreak', id, true);
              }
            } else if (msg.kind === 'place') {
              const id = String((msg as any).id || '');
              const placeKind = (msg as any).placeKind;
              const type = placeKind === 'campfire' || placeKind === 'forge' || placeKind === 'forgeTable' || placeKind === 'chest' ? placeKind : null;
              if (!id || !type) {
                setResult('place', id || '', false, 'invalid');
              } else if (next.placed.some((p: any) => String(p?.id) === id)) {
                // Id is globally unique per player in current client; treat duplicates as no-op.
                setResult('place', id, false, 'duplicate');
              } else {
                // Chest placement must create its DB record; otherwise we'd have a "ghost chest"
                // that exists in chunk state but cannot be opened/removed safely.
                if (type === 'chest') {
                  try {
                    await db
                      .insert(chestState)
                      .values({ worldId: st.worldId, chestId: id, ownerId: st.guestId, state: { slots: Array.from({ length: 15 }, () => null) }, updatedAt: new Date() })
                      .onConflictDoNothing();
                  } catch (err) {
                    app.log.error({ err, event: 'ws_place_chest_db_failed', worldId: st.worldId, chestId: id, ownerId: st.guestId }, 'chest placement failed (db)');
                    setResult('place', id, false, 'invalid');
                    return;
                  }
                }

                next.placed.push({ id, type, x, z });
                setResult('place', id, true);
              }
            } else if (msg.kind === 'placeRemove') {
              const id = String((msg as any).id || '');
              const placeKind = (msg as any).placeKind;
              const pickup = !!(msg as any).pickup;
              const type = placeKind === 'campfire' || placeKind === 'forge' || placeKind === 'forgeTable' || placeKind === 'chest' ? placeKind : null;
              if (!id || !type) {
                setResult('placeRemove', id || '', false, 'invalid');
              } else {
                const idx = next.placed.findIndex((p: any) => String(p?.id) === id && String(p?.type) === type);
                if (idx < 0) {
                  setResult('placeRemove', id, false, 'invalid');
                } else {
                  // If chest is "locked" (ownership), only the owner may remove/pickup.
                  if (type === 'chest') {
                    try {
                      const rows = await db
                        .select({ ownerId: chestState.ownerId, state: chestState.state })
                        .from(chestState)
                        .where(and(eq(chestState.worldId, st.worldId), eq(chestState.chestId, id)))
                        .limit(1);

                      if (!rows.length) {
                        setResult('placeRemove', id, false, 'invalid');
                      } else if (String(rows[0].ownerId) !== String(st.guestId)) {
                        setResult('placeRemove', id, false, 'invalid');
                      } else {
                        if (pickup) {
                          // Only allow pickup if empty.
                          const slots = Array.isArray((rows[0].state as any)?.slots) ? (rows[0].state as any).slots : [];
                          const nonEmpty = slots.some((s: any) => s && Number(s.qty || 0) > 0);
                          if (nonEmpty) {
                            setResult('placeRemove', id, false, 'invalid');
                          } else {
                            next.placed.splice(idx, 1);
                            try {
                              await db.delete(chestState).where(and(eq(chestState.worldId, st.worldId), eq(chestState.chestId, id)));
                            } catch {
                              // best-effort
                            }
                            setResult('placeRemove', id, true);
                          }
                        } else {
                          // destroy: allow only if empty (same rule, for now)
                          const slots = Array.isArray((rows[0].state as any)?.slots) ? (rows[0].state as any).slots : [];
                          const nonEmpty = slots.some((s: any) => s && Number(s.qty || 0) > 0);
                          if (nonEmpty) {
                            setResult('placeRemove', id, false, 'invalid');
                          } else {
                            next.placed.splice(idx, 1);
                            try {
                              await db.delete(chestState).where(and(eq(chestState.worldId, st.worldId), eq(chestState.chestId, id)));
                            } catch {
                              // best-effort
                            }
                            setResult('placeRemove', id, true);
                          }
                        }
                      }
                    } catch {
                      setResult('placeRemove', id, false, 'invalid');
                    }
                  } else {
                    // Other structures: allow any player for now.
                    next.placed.splice(idx, 1);
                    setResult('placeRemove', id, true);
                  }
                }
              }
            }

            // Always notify the sender about accept/reject (prevents free loot on late arrival).
            if (result && ws.readyState === ws.OPEN) ws.send(JSON.stringify(result));

            if (!((result as any)?.ok)) return;

            const version = (chunk.version ?? 0) + 1;
            await saveChunk({ worldId: st.worldId, chunkX: cx, chunkZ: cz, version, state: next });

            const out: WorldChunkMsg = {
              t: 'worldChunk',
              v: 1,
              worldId: st.worldId,
              chunkX: cx,
              chunkZ: cz,
              version,
              state: {
                removedTrees: activeRemoved(treeRespawnUntil),
                removedRocks: activeRemoved(rockRespawnUntil),
                removedSticks: activeRemoved(stickRespawnUntil),
                removedBushes: activeRemoved(bushRespawnUntil),
                removedOres: activeRemoved(oreRespawnUntil),
                placed: next.placed,
                farmPlots: Object.entries(next.farmPlots || {})
                  .map(([id, p]: any) => ({
                    id: String(id),
                    x: Number(p?.x),
                    z: Number(p?.z),
                    tilledAt: Number(p?.tilledAt),
                    seedId: p?.seedId != null ? String(p.seedId) : null,
                    plantedAt: p?.plantedAt != null ? Number(p.plantedAt) : null,
                    growMs: p?.growMs != null ? Number(p.growMs) : null,
                  }))
                  .filter((p: any) => p.id && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.tilledAt)),

              },
            };

            broadcastWorldChunk(st.worldId, cx, cz, out);
          })
          .catch(() => null);

        })();
        return;
      }

      if (msg.t === 'teleport') {
        const pid = ws.__playerId;
        if (!pid) return;

        const st = players.get(pid);
        if (!st) return;

        if (msg.v !== 1) return;
        if (![msg.x, msg.y, msg.z].every((n) => typeof n === 'number' && Number.isFinite(n))) return;

        // Basic sanity clamp to avoid insane values.
        const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
        st.x = clamp(msg.x, -500, 500);
        st.y = clamp(msg.y, 0, 50);
        st.z = clamp(msg.z, -500, 500);
        st.vy = 0;
        st.onGround = false;
        st.input = undefined;
        // same reasoning as input: do not trust client clock
        st.lastAtMs = nowMs();
        return;
      }

      if (msg.t === 'input') {
        const pid = ws.__playerId;
        if (!pid) return;

        const st = players.get(pid);
        if (!st) return;

        if (msg.v !== 1) return;
        if (typeof msg.seq !== 'number') return;
        if (msg.seq <= st.lastSeq) return;

        // IMPORTANT: do NOT trust client clock for freshness.
        // lastAtMs is used server-side to drop stale input; clock skew would cause
        // the server to ignore all movement -> client drifts then gets pulled back.
        st.lastAtMs = nowMs();
        st.lastSeq = msg.seq;

        st.input = msg;

        // Redis: renew room membership TTL on fresh input (keeps room list warm)
        if (redis) {
          try {
            void redis
              .multi()
              .sAdd(keyRoomPlayers(st.worldId), pid)
              .expire(keyRoomPlayers(st.worldId), REDIS_TTL_ROOM_PLAYERS_S)
              .exec();
          } catch {
            // best-effort
          }
        }

        return;
      }
    });

    ws.on('close', () => {
      const pid = ws.__playerId;
      if (!pid) {
        mpStats?.onConnClose();
        app.log.info({ event: 'ws_close', remoteAddress }, 'ws connection closed');
        return;
      }
      const st = players.get(pid);
      if (!st) {
        mpStats?.onConnClose();
        app.log.info({ event: 'ws_close', remoteAddress, playerId: pid }, 'ws connection closed');
        return;
      }

      // Remove from room
      const ids = roomsLocal.get(st.worldId);
      ids?.delete(pid);
      if (ids && ids.size === 0) roomsLocal.delete(st.worldId);

      // Redis: best-effort remove from room set (otherwise TTL will clear).
      if (redis) {
        try {
          void redis.sRem(keyRoomPlayers(st.worldId), pid);
        } catch {
          // best-effort
        }
      }

      mpStats?.onLeave(st.worldId);
      mpStats?.onConnClose();
      app.log.info({ event: 'ws_leave', remoteAddress, worldId: st.worldId, playerId: pid }, 'ws player left');

      players.delete(pid);
    });
  });

  app.server.on('upgrade', (req, socket, head) => {
    try {
      const url = req.url || '';
      if (!url.startsWith('/ws')) return;
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
    } catch {
      socket.destroy();
    }
  });
}
