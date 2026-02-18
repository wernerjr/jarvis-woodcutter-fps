# Feature — Configurações do jogador

## Objetivo
Persistir preferências de experiência (ex.: modo performance, view bob) por jogador e mundo.

## Fluxos principais
1. Client chama `GET /api/player/settings` ao abrir sessão.
2. Usuário altera configurações no menu.
3. Client chama `PUT /api/player/settings`.

## Entidades/dados
- Tabela `player_settings`
  - chave: `(guest_id, world_id)`
  - `settings` JSONB (ex.: `perfEnabled`, `viewBobEnabled`, `preview3dEnabled`)

## APIs/métodos
### PUT exemplo
```json
{
  "guestId": "uuid",
  "worldId": "world-1",
  "settings": {
    "perfEnabled": true,
    "viewBobEnabled": false,
    "preview3dEnabled": true
  }
}
```

Erros comuns:
- `400 invalid_query` / `400 invalid_body`
- `503 db_unavailable`

## Performance, segurança e edge cases
- Endpoint usa upsert para simplificar primeira gravação.
- GET retorna objeto vazio quando não há configuração persistida.
- Validação Zod protege contra payload fora de contrato.
