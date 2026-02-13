import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { worldChunkState } from '../db/schema.js';

type JoinMsg = {
  t: 'join';
  v: 1;
  guestId: string;
  worldId: string;
  // Optional spawn hint (used to avoid snapping to default spawn after reconnect/teleport).
  spawn?: { x: number; y: number; z: number };
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
  | { t: 'worldEvent'; v: 1; kind: 'oreBreak'; oreId: string; x: number; z: number; at: number }
  | { t: 'worldEvent'; v: 1; kind: 'place'; placeKind: 'campfire' | 'forge' | 'forgeTable'; id: string; x: number; z: number; at: number };

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

type ServerSnapshotMsg = {
  t: 'snapshot';
  v: 1;
  worldId: string;
  players: Array<{ id: string; x: number; y: number; z: number; yaw: number }>;
};

type ServerWelcomeMsg = { t: 'welcome'; v: 1; id: string; worldId: string };

type WorldChunkMsg = {
  t: 'worldChunk';
  v: 1;
  worldId: string;
  chunkX: number;
  chunkZ: number;
  version: number;
  state: {
    removedTrees: string[];
    removedRocks: string[];
    removedOres: string[];
    placed: Array<{ id: string; type: 'campfire' | 'forge' | 'forgeTable'; x: number; z: number }>;
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

function nowMs() {
  return Date.now();
}

export function registerWs(app: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true });

  /** playerId -> state */
  const players = new Map<string, PlayerState>();
  /** worldId -> set(playerId) */
  const rooms = new Map<string, Set<string>>();

  const chunkSize = 32;
  const chunkOf = (x: number, z: number) => ({
    cx: Math.floor(x / chunkSize),
    cz: Math.floor(z / chunkSize),
  });

  async function getChunk(worldId: string, chunkX: number, chunkZ: number) {
    const row = await db
      .select()
      .from(worldChunkState)
      .where(and(eq(worldChunkState.worldId, worldId), eq(worldChunkState.chunkX, chunkX), eq(worldChunkState.chunkZ, chunkZ)))
      .limit(1);

    if (row[0]) {
      const st = (row[0].state ?? {}) as any;
      return {
        worldId,
        chunkX,
        chunkZ,
        version: Number(row[0].version ?? 0),
        state: {
          removedTrees: Array.isArray(st.removedTrees) ? st.removedTrees.map(String) : [],
          removedRocks: Array.isArray(st.removedRocks) ? st.removedRocks.map(String) : [],
          removedOres: Array.isArray(st.removedOres) ? st.removedOres.map(String) : [],
          placed: Array.isArray(st.placed)
            ? st.placed
                .map((p: any) => ({ id: String(p?.id), type: p?.type, x: Number(p?.x), z: Number(p?.z) }))
                .filter((p: any) => p.id && (p.type === 'campfire' || p.type === 'forge' || p.type === 'forgeTable') && Number.isFinite(p.x) && Number.isFinite(p.z))
            : [],
        },
      };
    }

    // Create empty chunk row.
    await db.insert(worldChunkState).values({ worldId, chunkX, chunkZ, version: 0, state: {} });
    return {
      worldId,
      chunkX,
      chunkZ,
      version: 0,
      state: { removedTrees: [], removedRocks: [], removedOres: [], placed: [] },
    };
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

  function broadcastSnapshot(worldId: string) {
    const ids = rooms.get(worldId);
    if (!ids || ids.size === 0) return;

    const payload: ServerSnapshotMsg = {
      t: 'snapshot',
      v: 1,
      worldId,
      players: Array.from(ids)
        .map((id) => players.get(id))
        .filter(Boolean)
        .map((p) => ({ id: p!.id, x: p!.x, y: p!.y, z: p!.z, yaw: p!.yaw })),
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

      // Macro collision: keep within boundary.
      resolveCollisionsXZ(st, worldBoundaryColliders, capsuleR);

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

    // Snapshot step
    if (snapAcc >= snapDt) {
      snapAcc = 0;
      for (const worldId of rooms.keys()) broadcastSnapshot(worldId);
    }
  }, Math.floor(1000 / simHz));

  app.addHook('onClose', async () => {
    clearInterval(interval);
    wss.close();
  });

  wss.on('connection', (ws: AnyWs) => {
    ws.on('message', (raw) => {
      const msg = safeJsonParse(raw) as ClientMsg | null;
      if (!msg || typeof msg !== 'object') return;

      if (msg.t === 'join') {
        if (msg.v !== 1) return;
        if (!msg.guestId || !msg.worldId) return;

        const id = msg.guestId;
        ws.__playerId = id;

        const existing = players.get(id);
        const st: PlayerState = existing ?? {
          id,
          guestId: msg.guestId,
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

        // Reset input on join (prevents "stuck running" if old input lingers).
        st.input = undefined;

        // Apply optional spawn hint.
        if (msg.spawn && Number.isFinite(msg.spawn.x) && Number.isFinite(msg.spawn.y) && Number.isFinite(msg.spawn.z)) {
          st.x = msg.spawn.x;
          st.y = msg.spawn.y;
          st.z = msg.spawn.z;
        }

        players.set(id, st);

        if (!rooms.has(msg.worldId)) rooms.set(msg.worldId, new Set());
        rooms.get(msg.worldId)!.add(id);

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

        const clampNum = (n: any) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

        const x = 'x' in msg ? clampNum((msg as any).x) : null;
        const z = 'z' in msg ? clampNum((msg as any).z) : null;
        if (x == null || z == null) return;

        const { cx, cz } = chunkOf(x, z);

        getChunk(st.worldId, cx, cz)
          .then(async (chunk) => {
            const next = structuredClone(chunk.state) as any;
            next.removedTrees = Array.isArray(next.removedTrees) ? next.removedTrees.map(String) : [];
            next.removedRocks = Array.isArray(next.removedRocks) ? next.removedRocks.map(String) : [];
            next.removedOres = Array.isArray(next.removedOres) ? next.removedOres.map(String) : [];
            next.placed = Array.isArray(next.placed) ? next.placed : [];

            if (msg.kind === 'treeCut') {
              const id = String((msg as any).treeId || '');
              if (!id) return;
              if (!next.removedTrees.includes(id)) next.removedTrees.push(id);
            } else if (msg.kind === 'rockCollect') {
              const id = String((msg as any).rockId || '');
              if (!id) return;
              if (!next.removedRocks.includes(id)) next.removedRocks.push(id);
            } else if (msg.kind === 'oreBreak') {
              const id = String((msg as any).oreId || '');
              if (!id) return;
              if (!next.removedOres.includes(id)) next.removedOres.push(id);
            } else if (msg.kind === 'place') {
              const id = String((msg as any).id || '');
              const placeKind = (msg as any).placeKind;
              if (!id) return;
              const type = placeKind === 'campfire' || placeKind === 'forge' || placeKind === 'forgeTable' ? placeKind : null;
              if (!type) return;
              if (!next.placed.some((p: any) => String(p?.id) === id)) {
                next.placed.push({ id, type, x, z });
              }
            }

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
                removedTrees: next.removedTrees,
                removedRocks: next.removedRocks,
                removedOres: next.removedOres,
                placed: next.placed,
              },
            };

            broadcastWorldChunk(st.worldId, cx, cz, out);
          })
          .catch(() => null);

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
        st.lastAtMs = typeof msg.at === 'number' ? msg.at : nowMs();
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

        // Clamp client-provided dt, but sim uses fixed dt anyway.
        const at = typeof msg.at === 'number' ? msg.at : nowMs();
        st.lastAtMs = at;
        st.lastSeq = msg.seq;

        st.input = msg;
        return;
      }
    });

    ws.on('close', () => {
      const pid = ws.__playerId;
      if (!pid) return;
      const st = players.get(pid);
      if (!st) return;

      // Remove from room
      const ids = rooms.get(st.worldId);
      ids?.delete(pid);
      if (ids && ids.size === 0) rooms.delete(st.worldId);

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
