# Arquitetura do Server

## Sumário
- [1. Responsabilidades](#1-responsabilidades)
- [2. Camadas](#2-camadas)
- [3. Endpoints e contratos](#3-endpoints-e-contratos)
- [4. Persistência e concorrência](#4-persistência-e-concorrência)
- [5. Requisitos não funcionais](#5-requisitos-não-funcionais)

## 1. Responsabilidades
1. Expor APIs HTTP e endpoint WS.
2. Validar entrada com Zod.
3. Persistir estados em PostgreSQL.
4. Sincronizar multiplayer e eventos de mundo.
5. Coordenar concorrência de recursos compartilhados (forja/baú).

## 2. Camadas
- **Entrypoint**: `src/index.ts` (startup, health, registro de rotas, ws e stats).
- **Routes**: `src/routes/*` (auth, player, settings, forja, baú).
- **WS server**: `src/ws/wsServer.ts` (join/input/snapshot/worldEvent/chunks).
- **Data access**: `src/db/*` (schema, client e migração).
- **Infra adapters**: `src/redis/client.ts`, `src/env.ts`.

## 3. Endpoints e contratos
### 3.1 Health
- `GET /api/health` → status de serviço.

### 3.2 Auth guest
- `POST /api/auth/guest`
- Entrada: `guestId?`, `worldId?`
- Saída: `guestId`, `worldId`, `token` assinado, `tokenExpMs`.

### 3.3 Player
- `GET /api/player/state?guestId=&worldId=`
- `PUT /api/player/state`
- `GET /api/player/settings?guestId=&worldId=`
- `PUT /api/player/settings`

### 3.4 Forja
- `GET|PUT /api/forge/state`
- `GET /api/forge/lock/status`
- `POST /api/forge/lock/renew`
- `POST /api/forge/lock/release`

### 3.5 Baú
- `GET|PUT /api/chest/state`
- `GET /api/chest/access`
- `GET /api/chest/lock/status`
- `POST /api/chest/lock/renew`
- `POST /api/chest/lock/release`

### 3.6 Multiplayer stats
- `GET /api/mp/stats` (com token opcional via header `x-mp-token`).

## 4. Persistência e concorrência
- **PostgreSQL**: fonte de verdade dos estados.
- **Redis**:
  1. locks distribuídos de forja/baú,
  2. cache com TTL,
  3. presença/snapshots multiplayer,
  4. rate limit de world events.
- **Fail-fast no startup**: servidor encerra se DB ou Redis indisponíveis.

## 5. Requisitos não funcionais
- **Segurança**: token HMAC para WS + validação de payload + checks de ownership no baú.
- **Performance**: cache de chunk e snapshots compactáveis.
- **Resiliência**: fallback best-effort em partes não críticas de Redis.
- **Operação**: logs estruturados via Fastify e métricas básicas de sessão multiplayer.
