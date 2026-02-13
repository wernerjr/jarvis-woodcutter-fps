# Jarvis — Robô Lenhador (FPS)

FPS low‑poly em Three.js/WebGL: corte árvores, explore a mina, funda ferro na fornalha e evolua ferramentas (pedra → metal).

![Menu](docs/media/menu.png)
![Pausa](docs/media/pause.png)

## Principais sistemas (visão geral)
- **Player FPS**: WASD + mouse (pointer lock), sprint, pulo, swing com janela de impacto.
- **Progressão**: ferramentas de **pedra** e **metal** (dano + durabilidade), crafting e estações.
- **Mundo**: ciclo dia/noite, céu shader, fog e iluminação dinâmica.
- **Conteúdo**: árvores com HP/loot/respawn, pedras coletáveis, mina (portal) + minério de ferro.
- **Estações**:
  - **Forja (Fornalha)**: combustível + minério → barras de ferro (UI com progresso + VFX fogo/fumaça).
  - **Mesa de Forja**: cria ferramentas de metal usando barras.

## Stack
- Vite + JavaScript (ESM)
- Three.js
- UI via DOM (HTML/CSS)
- Docker: build estático servido por Nginx

## Rodar local (dev)
```bash
corepack enable
pnpm install
pnpm -C apps/client dev
```
Abra a URL que o Vite imprimir.

## Build/preview
```bash
pnpm -C apps/client build
pnpm -C apps/client preview
```

## Docker (produção)
```bash
docker compose up -d --build
```

## Controles (essenciais)
- Clique: capturar mouse (Pointer Lock)
- WASD: mover | Mouse: olhar
- Shift: correr | Espaço: pular
- 1–0: hotbar
- I: inventário | C: construção
- F: interagir com estruturas sob a mira (toque) • segurar F: roda Abrir/Recolher/Destruir
- ESC: pausa (não fecha modais)

## Estrutura do repo
- `src/main.js`: bootstrap de UI + handlers DOM
- `src/game/Game.js`: loop principal, state machine, input, integra managers
- `src/game/UI.js`: renderers DOM (inventário/hotbar/forja/mesa de forja)
- `src/game/items.js`: catálogo de itens
- `src/game/recipes.js`: receitas + stats de ferramentas
- `src/game/*Manager.js`: sistemas do mundo (árvores, mina, forja, etc.)
- `docs/`: documentação por tema

## Docs
- [Arquitetura](docs/architecture.md)
- [Gameplay loop](docs/gameplay-loop.md)
- [Interação (F tap/hold)](docs/interaction.md)
- [Inventário/hotbar](docs/systems-inventory.md)
- [Forja & Mesa de Forja](docs/systems-forge.md)
- [VFX de fogo (tocha/fogueira)](docs/vfx-fire.md)
- [Limite do mapa (rio)](docs/environment-river.md)
- [Lago (fechamento do rio)](docs/environment-lake.md)

## Para IAs / copilots
Veja **AGENTS.md** (contratos internos, mapa de sistemas e exemplos de tarefas).
