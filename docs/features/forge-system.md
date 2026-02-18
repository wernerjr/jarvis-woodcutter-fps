# Feature — Sistema de forja (furnace)

## Objetivo
Transformar minério em barra de ferro com base em combustível e tempo de processamento, com persistência e controle de concorrência.

## Fluxos principais
1. Player abre forja e solicita `GET /api/forge/state`.
2. Server tenta lock exclusivo por instância de forja.
3. Client altera slots e envia `PUT /api/forge/state` com `lockToken`.
4. Server processa catch-up e worker de background para continuar produção offline.
5. Ao fechar UI, lock pode ser liberado (`/lock/release`).

## Entidades/dados
- `forge_state`: `(world_id, forge_id, state, updated_at)`
- `state` inclui: `enabled`, `burn`, `prog`, `fuel[2]`, `input[2]`, `output[2]`

## APIs/métodos chamados
- `GET /api/forge/state`
- `PUT /api/forge/state`
- `GET /api/forge/lock/status`
- `POST /api/forge/lock/renew`
- `POST /api/forge/lock/release`

Erros comuns:
- `423 locked`
- `400 invalid_forge_state`
- `503 db_unavailable`

## Performance, segurança e edge cases
- Cache Redis com TTL para leituras rápidas.
- Lock evita escrita concorrente de duas sessões.
- Catch-up limitado para evitar loops gigantes em longa inatividade.
- Regras de consumo validam combustível e espaço de output.
