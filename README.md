# Jarvis — Robô Lenhador (FPS)

Jogo em primeira pessoa (WebGL) com movimentação WASD, pointer lock, árvores cortáveis e respawn.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

## Docker (produção)

```bash
docker compose up -d --build
# abre em http://localhost:8080
```

## Controles
- Clique: capturar mouse (Pointer Lock)
- WASD: mover
- Mouse: olhar
- Clique esquerdo: cortar
- ESC: soltar mouse
