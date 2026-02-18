# Feature — Multiplayer em tempo real (WebSocket)

## Objetivo
Sincronizar presença e movimentação de jogadores em tempo real, com autoridade do servidor para estado compartilhado.

## Fluxos principais
1. Client autentica via `POST /api/auth/guest`.
2. WS conecta e envia `join` com token.
3. Server valida token/expiração e confirma com `welcome`.
4. Client envia `input` e eventos.
5. Server simula movimento em tick fixo e envia `snapshot`.

## Entidades/dados
- Estado volátil do player (posição, yaw, pitch, velocidade).
- Presença por mundo (`room:<worldId>:players` no Redis).

## APIs/métodos chamados
Mensagens:
- Client → Server: `join`, `input`, `teleport`, `worldEvent`
- Server → Client: `welcome`, `snapshot`, `worldChunk`, `worldEventResult`, `error`

Exemplo `snapshot` (compacto desativado):
```json
{
  "t": "snapshot",
  "v": 1,
  "worldId": "world-1",
  "players": [{"id":"p1","x":1.2,"y":1.65,"z":3.4,"yaw":0.1}]
}
```

Erros comuns:
- `auth_required`
- `auth_invalid`
- `auth_expired`
- `bad_join`

## Performance, segurança e edge cases
- Tick de simulação e snapshot em frequência fixa.
- Opção de snapshot compacto para reduzir payload.
- Rate limit em `worldEvent` (Redis + fallback local).
- Reconexão: server reinicializa sequência para evitar rubber-band extremo.
