import type { FastifyInstance } from 'fastify';

export type MpStats = {
  startedAt: number;
  connectionsTotal: number;
  connectionsByWorld: Record<string, number>;
  playersByWorld: Record<string, number>;
};

export function createMpStats() {
  const st: MpStats = {
    startedAt: Date.now(),
    connectionsTotal: 0,
    connectionsByWorld: {},
    playersByWorld: {},
  };

  const inc = (obj: Record<string, number>, key: string, delta: number) => {
    obj[key] = (obj[key] ?? 0) + delta;
    if (obj[key] <= 0) delete obj[key];
  };

  return {
    snapshot() {
      return structuredClone(st);
    },
    onConnOpen() {
      st.connectionsTotal += 1;
    },
    onConnClose() {
      st.connectionsTotal = Math.max(0, st.connectionsTotal - 1);
    },
    onJoin(worldId: string) {
      inc(st.connectionsByWorld, worldId, +1);
      inc(st.playersByWorld, worldId, +1);
    },
    onLeave(worldId: string) {
      inc(st.playersByWorld, worldId, -1);
    },
  };
}

export type MpStatsCollector = ReturnType<typeof createMpStats>;

export async function registerMpStatsRoute(app: FastifyInstance, collector: MpStatsCollector, opts: { token?: string }) {
  app.get('/api/mp/stats', async (req, reply) => {
    const token = (opts.token || '').trim();
    if (token) {
      const got = String(req.headers['x-mp-token'] || '');
      if (got !== token) return reply.status(401).send({ ok: false, error: 'unauthorized' });
    }

    const snap = collector.snapshot();
    return {
      ok: true,
      startedAt: new Date(snap.startedAt).toISOString(),
      connectionsTotal: snap.connectionsTotal,
      connectionsByWorld: snap.connectionsByWorld,
      playersByWorld: snap.playersByWorld,
    };
  });
}
