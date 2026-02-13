# Multiplayer (WebSocket) — MVP

> Status: MVP inicial. Protocolo sujeito a mudanças.

## Endpoint
- URL: `/ws`
- Transporte: WebSocket (ws/wss via Caddy)

## Visão geral
- O client conecta ao WS ao entrar em **Play**.
- Antes de conectar/join, o client obtém um token via `POST /api/auth/guest` (token curto, 60min) e envia no `join`.
- Se cair, o client tenta **reconectar automaticamente** (backoff).
- O client envia `join` e depois envia `input` periodicamente.
- O server simula movimento (20Hz) e publica `snapshot` (10Hz) com todos players na sala.

## Mensagens (JSON)

### Client → Server

#### `join`
```json
{
  "t": "join",
  "v": 1,
  "worldId": "world-1",
  "token": "<token de POST /api/auth/guest>",
  "guestId": "<uuid> (opcional; debug)",
  "spawn": { "x": 0, "y": 1.65, "z": 6 }
}
```

#### `teleport`
```json
{ "t": "teleport", "v": 1, "x": 0, "y": 1.65, "z": 0, "at": 1700000000000 }
```

#### `input`
```json
{
  "t": "input",
  "v": 1,
  "seq": 1,
  "dt": 0.05,
  "keys": { "w": true, "a": false, "s": false, "d": false, "sprint": false, "jump": false },
  "yaw": 0,
  "pitch": 0,
  "at": 1700000000000
}
```
- `seq`: sequência monotônica (anti re-order)
- `at`: epoch ms (telemetria/diagnóstico)

### Client → Server (eventos do mundo)

#### `worldEvent`
Evento "estrito": o client solicita uma mudança no mundo, mas **só aplica loot/remoção** quando o servidor confirmar via `worldChunk`.

Tipos atuais (`kind`):
- `treeCut` → `{ treeId, x, z, at }`
- `rockCollect` → `{ rockId, x, z, at }`
- `stickCollect` → `{ stickId, x, z, at }`
- `oreBreak` → `{ oreId, x, z, at }`
- `place` → `{ placeKind, id, x, z, at }`

Exemplo:
```json
{ "t": "worldEvent", "v": 1, "kind": "rockCollect", "rockId": "12", "x": 1.2, "z": -3.4, "at": 1700000000000 }
```

### Server → Client

#### `welcome`
```json
{ "t": "welcome", "v": 1, "id": "<guestId>", "worldId": "world-1" }
```

#### `snapshot`
```json
{
  "t": "snapshot",
  "v": 1,
  "worldId": "world-1",
  "players": [
    { "id": "<guestId>", "x": 0, "y": 1.65, "z": 0, "yaw": 0 }
  ]
}
```

#### `worldChunk`
Estado persistido de um chunk do mundo. O servidor envia quando:
- o player entra (chunks próximos)
- alguém altera o mundo naquele chunk (e também no respawn)

`removed*` são **remoções ativas** (temporárias) — quando o id some da lista, a entidade reaparece.

```json
{
  "t": "worldChunk",
  "v": 1,
  "worldId": "world-1",
  "chunkX": 0,
  "chunkZ": 0,
  "version": 12,
  "state": {
    "removedTrees": ["1", "9"],
    "removedRocks": ["2"],
    "removedSticks": ["7"],
    "removedOres": ["3"],
    "placed": [
      { "id": "camp-1", "type": "campfire", "x": 1.0, "z": 2.0 }
    ]
  }
}
```

## Regras do servidor (MVP)
- Rooms são separadas por `worldId`.
- Server-authoritative: o servidor simula com física simples (gravidade + pulo + movimento no plano).
- Colisão no servidor (MVP): **macro boundary** para não sair do mapa (não cobre árvores/props ainda).
- `pose` foi removido; o client não manda posição.

### Respawn (server-authoritative)
O servidor persiste respawn temporário por chunk (campos internos `*RespawnUntil`) e emite `worldChunk` no collect/break e no respawn.
Tempos atuais:
- rocks: **30s**
- sticks (galhos no chão): **30s**
- trees: **45s**
- iron ore: **120s (2min)**

### UX de pickup (client)
- Pedras e galhos têm **hitbox invisível maior** para facilitar o raycast/pickup (sem alterar a distância máxima de interação).
- O raycast para pedras é **recursivo** (a pedra é um `Group` com mesh + hitbox filho).

## Próximos passos (planejado)
- Autenticação do WS via token/assinatura (ou reaproveitar guest + sessão).
- Trocar `pose` por `input` (server-authoritative de verdade).
- Deltas/snapshots otimizados.
- Replicação de entidades do mundo (incl. chunks com removals temporários/respawn).
