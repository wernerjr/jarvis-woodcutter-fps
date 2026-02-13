# jarvis-woodcutter-fps

FPS low‑poly em Three.js/WebGL (client) com backend (Fastify/TS) para persistência e multiplayer.

## Estrutura (monorepo)
- `apps/client`: jogo (Vite + Three.js) → build estático servido por Nginx
- `apps/server`: backend (Fastify + TypeScript + Postgres/Drizzle) → porta **3023**

## Rodar local (DEV)
Pré-req: Node 22+ e **pnpm** (via corepack).

```bash
corepack enable
pnpm install

docker compose up -d postgres
pnpm dev
```
- Client: Vite imprime a URL
- Server: http://localhost:3023/api/health

## Rodar via Docker (PROD-like, sem Caddy)
Pré-req: a rede docker `shared` deve existir (usada pelo Caddy externo).

```bash
docker network create shared || true
docker compose up -d --build
```

Isso sobe:
- `client` (Nginx, porta interna 80)
- `server` (porta interna 3023)
- `postgres`

## Caddy (separado)
O Caddy do servidor deve fazer proxy para:
- `/` → `jarvis-woodcutter-client:80`
- `/api/*` → `jarvis-woodcutter-server:3023`
- `/ws` (upgrade websocket) → `jarvis-woodcutter-server:3023`

## Documentação do jogo
Veja `apps/client/README.md` e `apps/client/docs/`.
