# jarvis-woodcutter-fps

FPS low‑poly em Three.js/WebGL (client) com backend (Fastify/TS) para persistência e multiplayer.

## Estrutura (monorepo)
- `apps/client`: jogo (Vite + Three.js) → build estático servido por Nginx
- `apps/server`: backend (Fastify + TypeScript + Postgres/Drizzle) → porta **3023**

## Rodar local (DEV)
Pré-req: Node 22+ e **pnpm**.

> Importante: o backend precisa de acesso ao Postgres shared (`shared-postgres`) e a `DATABASE_URL` deve usar as credenciais corretas desse Postgres.

```bash
pnpm install

# Ajuste se necessário (credenciais do shared-postgres)
export WOODCUTTER_DATABASE_URL='postgres://woodcutter:<SENHA>@shared-postgres:5432/woodcutter'

pnpm dev
```
- Client: Vite imprime a URL
- Server: http://localhost:3023/api/health
- Guest bootstrap: `POST /api/auth/guest`

## Docker (recomendado no servidor)
Pré-req:
- a rede docker `shared` deve existir (usada pelo Caddy externo)
- Postgres shared rodando (container `shared-postgres`)
- `WOODCUTTER_DATABASE_URL` injetada pelo Infisical

```bash
docker network create shared || true

# recomendado: subir via Infisical
infup -- docker compose up -d --build
```

Isso sobe:
- `client` (Nginx, porta interna 80)
- `server` (porta interna 3023)

Obs: **não** sobe Postgres por aqui; usa o `shared-postgres` existente na rede `shared`.

## Caddy (separado)
O Caddy do servidor deve fazer proxy para:
- `/` → `jarvis-woodcutter-client:80`
- `/api/*` → `jarvis-woodcutter-server:3023`
- `/ws` (upgrade websocket) → `jarvis-woodcutter-server:3023`

## Documentação do jogo
Veja `apps/client/README.md` e `apps/client/docs/`.
