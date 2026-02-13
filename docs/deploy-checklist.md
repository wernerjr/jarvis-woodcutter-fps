# Deploy checklist — jarvis-woodcutter-fps (MVP)

## Pré-requisitos (host)
- Docker + docker compose
- Rede docker compartilhada:
  ```bash
  docker network create shared || true
  ```
- Postgres na rede `shared` (container `shared-postgres`) com DB `woodcutter`
- Secrets via Infisical:
  - `WOODCUTTER_DATABASE_URL` (ou `DATABASE_URL`) — formato:
    `postgres://woodcutter:<SENHA>@shared-postgres:5432/woodcutter`
  - `WOODCUTTER_WS_AUTH_SECRET` — secret para token curto do WS
  - (opcional) `WOODCUTTER_MP_STATS_TOKEN` — protege `/api/mp/stats`

## Subir o app (recomendado)
> Importante: quando depender de secrets do Infisical, **não** rodar `docker compose up` direto.

```bash
infup -- docker compose up -d --build --remove-orphans
```

## Proxy / Caddy (externo)
O Caddy do servidor deve fazer proxy para:
- `/` → `jarvis-woodcutter-client:80`
- `/api/*` → `jarvis-woodcutter-server:3023`
- `/ws` (upgrade websocket) → `jarvis-woodcutter-server:3023`

Checklist WS upgrade:
- Garantir `Connection: upgrade` e `Upgrade: websocket` no proxy
- Garantir que `/ws` não é cacheado

## Smoke test (manual)
1) **Health**
   - `GET /api/health` → `{ ok:true }`

2) **Auth guest + token WS**
   - `POST /api/auth/guest` → retorna `{ guestId, worldId, token }`

3) **Conectar WS**
   - Abrir o client no browser
   - Clicar **Play** → `NET: WS ok`
   - Abrir outra aba/janela e entrar também → deve aparecer 1 remote player

4) **World events (server-authoritative)**
   - Coletar pedra/galho e minerar/cortar com outro player por perto
   - Verificar que o item só entra no inventário quando o server confirmar

5) (Opcional) **Stats**
   - `GET /api/mp/stats`
   - Se `WOODCUTTER_MP_STATS_TOKEN` estiver setado:
     - enviar header `x-mp-token: <token>`

## Troubleshooting rápido
- WS não conecta:
  - conferir proxy do Caddy para `/ws`
  - conferir TLS/wss
- Backend falha ao iniciar:
  - conferir `WOODCUTTER_DATABASE_URL`
  - conferir se migrations rodaram
