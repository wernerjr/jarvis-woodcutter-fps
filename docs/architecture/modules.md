# Arquitetura — Módulos e Interfaces

## Sumário
- [1. Visão de módulos](#1-visão-de-módulos)
- [2. Interfaces entre módulos](#2-interfaces-entre-módulos)
- [3. Contratos de dados principais](#3-contratos-de-dados-principais)
- [4. Requisitos não funcionais](#4-requisitos-não-funcionais)

## 1. Visão de módulos
### 1.1 Client
- Renderização 3D, input, HUD e loop local de jogo.
- Gera interações de mundo e chama API/WS.
- Responsável por UX de inventário, forja, crafting e menus.

### 1.2 Server
- Autenticação guest e emissão de token WS.
- Persistência de estado de jogador/configurações.
- Sincronização de mundo por chunk.
- Gestão de forja/baú com lock e concorrência.
- Simulação multiplayer server-authoritative (posição/eventos).

### 1.3 Serviços externos
- PostgreSQL (persistência durável).
- Redis (cache, locks, presença, rate limiting distribuído).

### 1.4 Integrações de runtime
- Caddy/reverse proxy externo roteando `/`, `/api/*`, `/ws` para os containers.

## 2. Interfaces entre módulos
### 2.1 Client ↔ Server (REST)
Principais endpoints:
1. `POST /api/auth/guest`
2. `GET|PUT /api/player/state`
3. `GET|PUT /api/player/settings`
4. `GET|PUT /api/forge/state` + lock endpoints
5. `GET|PUT /api/chest/state` + lock/access endpoints
6. `GET /api/health`
7. `GET /api/mp/stats` (opcionalmente protegido por token)

Exemplo de bootstrap guest:
```json
{
  "guestId": "optional-existing-id",
  "worldId": "world-1"
}
```
Resposta:
```json
{
  "ok": true,
  "guestId": "uuid",
  "worldId": "world-1",
  "token": "<signed-token>",
  "tokenExpMs": 1760000000000
}
```

### 2.2 Client ↔ Server (WebSocket)
- Handshake com mensagem `join` contendo token emitido em `/api/auth/guest`.
- Troca de `input`, `teleport` e `worldEvent`.
- Servidor responde com `welcome`, `snapshot`, `worldChunk`, `worldEventResult`.

Exemplo `join`:
```json
{
  "t": "join",
  "v": 1,
  "worldId": "world-1",
  "token": "<signed-token>",
  "spawn": {"x": 0, "y": 1.65, "z": 6}
}
```

### 2.3 Server ↔ PostgreSQL
- Drizzle ORM com tabelas:
  - `guests`, `worlds`, `player_state`, `player_settings`,
  - `world_chunk_state`, `forge_state`, `chest_state`.

### 2.4 Server ↔ Redis
- Chaves para presença de jogadores e snapshots.
- Cache de chunk/forja/baú com TTL.
- Locks (`lock:forge:*`, `lock:chest:*`) com renovação.
- Rate limit distribuído de `worldEvent`.

## 3. Contratos de dados principais
### 3.1 ItemSlot
```json
{
  "id": "iron_ore",
  "qty": 3,
  "meta": {}
}
```

### 3.2 ForgeState (persistido)
```json
{
  "enabled": true,
  "burn": 12.5,
  "prog": 4.2,
  "fuel": [null, {"id":"log","qty":2}],
  "input": [{"id":"iron_ore","qty":7}, null],
  "output": [{"id":"iron_ingot","qty":1}, null]
}
```

### 3.3 ChestState (persistido)
```json
{
  "slots": [
    {"id":"log","qty":20},
    null
  ]
}
```

## 4. Requisitos não funcionais
### 4.1 Performance
- Snapshot multiplayer com opção compacta (`WOODCUTTER_SNAPSHOT_COMPACT`).
- Cache Redis para reduzir leitura repetida de chunk/forja/baú.
- Tick server fixo para simulação e broadcast.

### 4.2 Escalabilidade
- Redis permite coordenação em múltiplas instâncias de server (locks/rate-limit/presença).
- Persistência desacoplada do container do server.

### 4.3 Segurança
- Token WS assinado com HMAC e expiração.
- Validação de payloads com Zod.
- Verificação de ownership em baú.
- Rate limiting de eventos de mundo.

### 4.4 Observabilidade
- Fastify logger ativo.
- Endpoint de saúde (`/api/health`).
- Métricas básicas de multiplayer (`/api/mp/stats`).
