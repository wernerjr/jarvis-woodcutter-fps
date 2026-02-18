# Feature — Sincronização de mundo por chunks e eventos

## Objetivo
Manter estado compartilhado de mundo (remoções, placements, farm) consistente entre jogadores e sessões.

## Fluxos principais
1. Client recebe chunks iniciais ao entrar no mundo.
2. Ao interagir (ex.: cortar árvore), client envia `worldEvent`.
3. Server valida distância/rate/duplicidade e persiste em `world_chunk_state`.
4. Server envia `worldEventResult` + `worldChunk` atualizado.
5. Respawns são aplicados por tempo (server side) e rebroadcast.

## Entidades/dados
- `world_chunk_state`
  - chave: `(world_id, chunk_x, chunk_z)`
  - `state` JSONB: removals temporários, placements, farm plots
  - `version` para evolução do chunk

## APIs/métodos chamados
- Mensagens WS `worldEvent` com tipos como:
  - `treeCut`, `rockCollect`, `stickCollect`, `bushCollect`, `oreBreak`
  - `plotTill`, `plant`, `harvest`
  - `place`, `placeRemove`

Exemplo:
```json
{ "t": "worldEvent", "v": 1, "kind": "treeCut", "treeId": "tree-123", "x": 10, "z": 22, "at": 1760000000000 }
```

## Performance, segurança e edge cases
- Chunking evita estado monolítico único.
- Cache Redis reduz leitura repetida no banco.
- Server impede interação fora de alcance (`WORLD_EVENT_RADIUS`).
- Respawn timer evita remoções permanentes não desejadas.
