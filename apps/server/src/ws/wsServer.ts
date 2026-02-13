import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';

type JoinMsg = { t: 'join'; v: 1; guestId: string; worldId: string };
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

type ClientMsg = JoinMsg | InputMsg;

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

  function stepPlayer(st: PlayerState, dt: number) {
    const eyeHeight = 1.65;
    const groundY = 0;
    const gravity = -18;
    const jumpSpeed = 6.4;
    const baseSpeed = 6.0;
    const sprintMult = 1.65;

    const inp = st.input;
    if (inp) {
      st.yaw = inp.yaw;
      st.pitch = inp.pitch;

      const forward = Number(inp.keys.s) - Number(inp.keys.w);
      const strafe = Number(inp.keys.d) - Number(inp.keys.a);

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
      const speed = baseSpeed * (inp.keys.sprint && moving ? sprintMult : 1.0);

      st.x += rx * speed * dt;
      st.z += rz * speed * dt;

      // jump (edge on client; server trusts boolean)
      if (inp.keys.jump && st.onGround) {
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
        players.set(id, st);

        if (!rooms.has(msg.worldId)) rooms.set(msg.worldId, new Set());
        rooms.get(msg.worldId)!.add(id);

        const welcome: ServerWelcomeMsg = { t: 'welcome', v: 1, id, worldId: msg.worldId };
        ws.send(JSON.stringify(welcome));
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
