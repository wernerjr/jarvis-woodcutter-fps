# Arquitetura — Visão Geral

## Sumário
- [1. Escopo](#1-escopo)
- [2. Contexto (C4 - nível Contexto)](#2-contexto-c4---nível-contexto)
- [3. Containers (C4 - nível Containers)](#3-containers-c4---nível-containers)
- [4. Tecnologias principais](#4-tecnologias-principais)
- [5. Tecnologias usadas no projeto (inventário completo)](#5-tecnologias-usadas-no-projeto-inventário-completo)
- [6. Decisões arquiteturais relevantes](#6-decisões-arquiteturais-relevantes)
- [7. Limites e trade-offs atuais](#7-limites-e-trade-offs-atuais)

## 1. Escopo
Projeto de jogo FPS low-poly com:
1. **Client WebGL** para simulação/local gameplay.
2. **Server Fastify** para persistência, autenticação guest e multiplayer via WebSocket.
3. **PostgreSQL** para estado persistente.
4. **Redis** para estado volátil/multiplayer e locks distribuídos.

## 2. Contexto (C4 - nível Contexto)
```text
[Jogador (browser desktop)]
        |
        | HTTP/WS
        v
[Jarvis Woodcutter FPS Platform]
   |-----------------------------|
   | Client (Vite/Three.js)      |
   | Server (Fastify/TS)         |
   |-----------------------------|
        |                    |
        | SQL                | Redis protocol
        v                    v
 [PostgreSQL compartilhado] [Redis compartilhado]
```

## 3. Containers (C4 - nível Containers)
```text
[Container: client (Nginx)]
  - Serve build estático do jogo
  - Entrada web para usuário

[Container: server (Node/Fastify)]
  - REST APIs (/api/*)
  - WebSocket (/ws)
  - Regras server-authoritative para multiplayer/world events
  - Locks de recursos (forja/baú) via Redis

[External: PostgreSQL]
  - player_state, player_settings, world_chunk_state, forge_state, chest_state

[External: Redis]
  - presença de jogadores e snapshots voláteis
  - cache de chunks/forja/baú
  - rate limit distribuído de world events
  - locks de concorrência (forja/baú)
```

## 4. Tecnologias principais
- **Engine gráfica**: Three.js (WebGL) no client.
- **Frontend runtime**: JavaScript ESM + Vite.
- **Backend runtime**: Node.js + TypeScript.
- **Framework backend**: Fastify.
- **Validação de contrato**: Zod.
- **ORM e migrações**: Drizzle ORM + drizzle-kit.
- **Banco de dados**: PostgreSQL.
- **Cache/mensageria leve/coordenação**: Redis.
- **Transporte multiplayer**: WebSocket (`ws`).
- **Containerização**: Docker + docker-compose.

## 5. Tecnologias usadas no projeto (inventário completo)

| Tecnologia | Onde é usada | Função no projeto |
|---|---|---|
| JavaScript (ESM) | Client (`apps/client`) | Linguagem base do front-end e módulos do jogo |
| Vite | Client (`apps/client`) | Dev server e build de produção |
| Three.js | Client (`apps/client`) | Renderização 3D via WebGL |
| Node.js | Server (`apps/server`) | Runtime backend |
| TypeScript | Server (`apps/server`) | Tipagem estática e manutenção do código servidor |
| Fastify | Server (`apps/server`) | Framework HTTP para APIs (`/api/*`) |
| WebSocket (`ws`) | Server (`apps/server`) | Comunicação multiplayer em tempo real (`/ws`) |
| Zod | Server (`apps/server`) | Validação de payloads e contratos |
| dotenv | Server (`apps/server`) | Carregamento de variáveis de ambiente |
| PostgreSQL (`pg`) | Server (`apps/server`) | Driver de conexão/acesso ao banco relacional |
| Redis (`redis`) | Server (`apps/server`) | Acesso a cache, estado volátil e coordenação distribuída |
| PostgreSQL | Dados persistentes | Fonte de verdade para estado de jogador/mundo/configurações |
| Redis | Dados voláteis/distribuídos | Presença, snapshots, locks e rate limiting distribuído |
| Drizzle ORM | Camada de dados (server) | ORM para modelagem e acesso ao PostgreSQL |
| drizzle-kit | Camada de dados (server) | Migrações e ferramentas de inspeção (studio) |
| pnpm workspaces | Monorepo (raiz) | Gerenciamento de pacotes/scripts entre apps |
| tsx | Server (`apps/server`) | Execução em modo watch no desenvolvimento |
| Docker + docker-compose | Operação/deploy local | Containerização de serviços e orquestração local |
| Nginx (container client) | Entrega do client | Servir build estático do jogo |


## 6. Decisões arquiteturais relevantes
1. **Server-authoritative para estado compartilhado do mundo**
   - World events (ex.: corte de árvore, coleta, placement) são validados e persistidos no servidor.
2. **Guest auth com token assinado para WS**
   - `POST /api/auth/guest` emite token curto assinado por HMAC para evitar spoof de `guestId` no websocket.
3. **Persistência híbrida**
   - PostgreSQL como fonte de verdade persistente.
   - Redis para baixa latência, locks e estado efêmero de multiplayer.
4. **Chunking do mundo no backend**
   - `world_chunk_state` para sincronizar removals/placements/farm por região.
5. **Processamento offline de forja no backend**
   - Catch-up no acesso e worker periódico para manter progressão mesmo sem UI aberta.

## 7. Limites e trade-offs atuais
- **MVP multiplayer**: não há sistema robusto de matchmaking/lobbies avançados.
- **Consistência eventual**: uso de cache Redis e múltiplos pods privilegia responsividade sobre serialização rígida global.
- **Guest identity**: simples e prática para protótipo; não substitui conta persistente com recuperação.
- **Escalabilidade horizontal**: suportada parcialmente (rate limit e presença via Redis), mas requer evolução de observabilidade e gestão de shard/world para grandes volumes.
