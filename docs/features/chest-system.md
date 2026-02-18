# Feature — Sistema de baú (chest)

## Objetivo
Permitir armazenamento persistente de itens por estrutura de baú, com propriedade e lock para evitar conflito de edição.

## Fluxos principais
1. Player tenta abrir baú (`GET /api/chest/state`).
2. Server verifica ownership (`ownerId == guestId`).
3. Server tenta lock do baú e retorna `lockToken`.
4. Player move itens e salva com `PUT /api/chest/state`.
5. Sessão renova ou libera lock.

## Entidades/dados
- `chest_state`: `(world_id, chest_id, owner_id, state, updated_at)`
- Estado normalizado para 15 slots (`slots[]`).

## APIs/métodos chamados
- `GET|PUT /api/chest/state`
- `GET /api/chest/access`
- `GET /api/chest/lock/status`
- `POST /api/chest/lock/renew`
- `POST /api/chest/lock/release`

Exemplo de state:
```json
{ "slots": [ {"id":"log","qty":30}, null, null ] }
```

Erros comuns:
- `403 forbidden` (não é owner)
- `423 locked`
- `404 not_found`

## Performance, segurança e edge cases
- Ownership impede leitura/edição por não dono.
- Lock por baú evita race condition entre clientes.
- Redis indisponível entra em modo best-effort para não travar gameplay.
