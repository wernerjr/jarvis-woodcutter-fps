# Multiplayer (WebSocket) — MVP

> Status: MVP inicial. Protocolo sujeito a mudanças.

## Endpoint
- URL: `/ws`
- Transporte: WebSocket (ws/wss via Caddy)

## Visão geral
- O client conecta ao WS ao entrar em **Play**.
- Se cair, o client tenta **reconectar automaticamente** (backoff).
- O client envia `join` e depois envia `input` periodicamente.
- O server simula movimento (20Hz) e publica `snapshot` (10Hz) com todos players na sala.

## Mensagens (JSON)

### Client → Server

#### `join`
```json
{ "t": "join", "v": 1, "guestId": "<uuid>", "worldId": "world-1" }
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

## Regras do servidor (MVP)
- Rooms são separadas por `worldId`.
- Server-authoritative: o servidor simula com física simples (gravidade + pulo + movimento no plano).
- `pose` foi removido; o client não manda posição.

## Próximos passos (planejado)
- Autenticação do WS via token/assinatura (ou reaproveitar guest + sessão).
- Trocar `pose` por `input` (server-authoritative de verdade).
- Deltas/snapshots otimizados.
- Replicação de entidades do mundo.
