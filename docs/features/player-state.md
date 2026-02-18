# Feature — Persistência de estado do jogador

## Objetivo
Salvar e recuperar o progresso do jogador (inventário, estado local do game, etc.) por mundo.

## Fluxos principais
1. Client inicia com `guestId/worldId`.
2. Client chama `GET /api/player/state`.
3. Durante gameplay, client chama `PUT /api/player/state` periodicamente ou em checkpoints.

## Entidades/dados
- Tabela `player_state`
  - chave: `(guest_id, world_id)`
  - campos: `state` (JSONB), `updated_at`

## APIs/métodos
### GET /api/player/state
Entrada (query): `guestId`, `worldId`

Resposta (sucesso):
```json
{ "ok": true, "state": {}, "updatedAt": "2026-01-01T00:00:00.000Z" }
```

### PUT /api/player/state
Entrada:
```json
{ "guestId": "uuid", "worldId": "world-1", "state": {"inventory": []} }
```
Saída: `{ "ok": true }`

Erros comuns:
- `400 invalid_query` / `400 invalid_body`
- `404 not_found` (GET sem estado)
- `503 db_unavailable`

## Performance, segurança e edge cases
- JSONB dá flexibilidade de schema para evolução do estado.
- Upsert não é usado neste endpoint; depende de bootstrap prévio da sessão guest.
- Ideal controlar frequência de writes no client para evitar sobrecarga.
