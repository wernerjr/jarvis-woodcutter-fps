import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';

type JoinMsg = { t: 'join'; v: 1; guestId: string; worldId: string };
type PoseMsg = { t: 'pose'; x: number; y: number; z: number; yaw: number; at: number };
type ClientMsg = JoinMsg | PoseMsg;

type PlayerState = {
  id: string;
  guestId: string;
  worldId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  lastAtMs: number;
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

  // Tick snapshots (low frequency MVP)
  const interval = setInterval(() => {
    for (const worldId of rooms.keys()) broadcastSnapshot(worldId);
  }, 100);

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
          lastAtMs: nowMs(),
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

      if (msg.t === 'pose') {
        const pid = ws.__playerId;
        if (!pid) return;

        const st = players.get(pid);
        if (!st) return;

        const at = typeof msg.at === 'number' ? msg.at : nowMs();
        const dt = Math.max(0.016, Math.min(0.25, (at - st.lastAtMs) / 1000));

        // Validate max speed (anti-teleport light)
        const dx = msg.x - st.x;
        const dz = msg.z - st.z;
        const dist = Math.hypot(dx, dz);
        const maxSpeed = 12; // m/s (generous)
        if (dist / dt > maxSpeed) {
          // ignore update
          return;
        }

        st.x = msg.x;
        st.y = msg.y;
        st.z = msg.z;
        st.yaw = msg.yaw;
        st.lastAtMs = at;
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
