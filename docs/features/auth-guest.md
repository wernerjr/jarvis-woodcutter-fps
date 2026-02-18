# Feature — Autenticação guest e sessão

## Objetivo
Permitir entrada rápida no jogo sem cadastro, criando/reativando uma identidade guest e emitindo token curto para autenticar o WebSocket.

## Fluxos principais
1. Client chama `POST /api/auth/guest`.
2. Server valida payload (`guestId?`, `worldId?`).
3. Server garante existência de `world` e `guest`.
4. Server garante linha em `player_state`.
5. Server emite token HMAC com expiração (`tokenExpMs`).
6. Client usa token no `join` do WS.

## Entidades/dados
- `guests` (id, createdAt, lastSeenAt)
- `worlds` (id, name)
- `player_state` inicial por (guestId, worldId)

## APIs/métodos
### Request
```json
{ "worldId": "world-1" }
```
### Response
```json
{
  "ok": true,
  "guestId": "uuid",
  "worldId": "world-1",
  "token": "signed-token",
  "tokenExpMs": 1760000000000
}
```
Erros comuns:
- `400 invalid_body`
- `503 db_unavailable`

## Performance, segurança e edge cases
- Token com validade curta reduz risco de reuso indevido.
- Assinatura HMAC evita spoof de `guestId` no WS.
- Em falha de banco no bootstrap, servidor responde indisponibilidade.
