# AGENTS.md — Jarvis Woodcutter FPS (para IAs)

## Objetivo do projeto (5–10 linhas)
FPS low‑poly em Three.js/WebGL com loop de progressão: cortar árvores → coletar recursos → craftar ferramentas/estruturas → minerar ferro → fundir na fornalha → forjar ferramentas de metal na mesa de forja.
Foco em **clareza visual**, **performance** e **arquitetura simples** (vanilla JS + módulos). Deploy é estático (Nginx) via Docker.

## Princípios / regras de design
- Low‑poly e legível (silhueta > detalhe). Evitar efeitos caros (muitas transparências/overdraw, milhares de meshes).
- Simulação congela fora de `state==='playing'` **exceto** sistemas explicitamente “always-on” (ex.: forja aberta usa `forgeDt`).
- Inventário: `20` slots, stacks até `100`, overflow vira toast e é descartado.
- Hotbar: `10` slots (slot 1 = mão fixa). Drag-and-drop normal é inventário↔hotbar; forja tem inventário embutido.
- ESC **não fecha modais** (fecha só via botões). ESC só alterna pausa quando não há modal.
- Interação com estruturas colocadas: **F tap** = ação principal; **F hold** = roda com opções dinâmicas por tipo/estado (ver `docs/interaction.md`).

## Mapa rápido de sistemas (arquivos principais)
- `src/game/Game.js`: “orquestrador” (state machine, loop, input, pointer lock, hotbar/tools, crafting, integra managers).
- `src/game/Player.js`: câmera + movimentação + swing/impact window + modelos na mão (pedra vs metal).
- `src/game/World.js`: céu shader, sol/lua, fog, luz ambiente, ciclo dia/noite.
- `src/game/Inventory.js`: regras de slots/stacks/add/remove.
- `src/game/items.js`: catálogo de itens (id, nome, ícone, stackable).
- `src/game/recipes.js`: receitas e stats de ferramentas (`DURABILITY`, `TOOL_STATS`, `RECIPES`, `FORGE_TABLE_RECIPES`).
- `src/game/UI.js`: renderers DOM (inventário, hotbar, forja UI, crafting, mesa de forja).
- Managers (conteúdo no mundo):
  - `TreeManager.js` (árvores + HP + respawn + loot)
  - `RockManager.js` (pedras coletáveis)
  - `MineManager.js` + `OreManager.js` (mina portal + nós de minério)
  - `CampfireManager.js` + `CampfireGhost.js` (fogueira)
  - `ForgeManager.js` + `ForgeGhost.js` (fornalha: combustível + fundição + VFX)
  - `ForgeTableManager.js` + `ForgeTableGhost.js` (estação de forja de metal)
  - `GrassManager.js` (foliage instanciado/culling; ver `docs/environment.md` para tuning)

## Contratos internos (o que manter estável)
### 1) Item slot
`{ id: string, qty: number, meta?: any }`
- stackable: `qty` até 100
- ferramentas: `meta` inclui `{ tool, tier, dmg, dur, maxDur }`

### 2) Loop principal
`Game._loop()` usa:
- `simDt = (state==='playing') ? dt : 0`
- `forgeDt = (state==='playing' || state==='forge') ? dt : 0` (forja continua enquanto UI aberta)

### 3) Damage window
`Player.onImpact(fn)` é chamado uma vez por swing (janela ~58%).
- `Game` decide o alvo e aplica dano conforme ferramenta equipada.

### 4) Drag & drop
- Inventário↔hotbar: `Game.moveItem({from:'inv'|'hot', idx}, {to:'inv'|'hot', idx})`
- Forja: `Game.moveItem(..., {to:'forge', kind:'fuel'|'in'|'out', idx})` com validação por slot.

## Como implementar features típicas (exemplos)
### A) Adicionar novo item stackável
1. Adicionar em `items.js` (id + `ITEMS[id]`).
2. Adicionar fonte do loot (Tree/Ore/etc) chamando `inventory.add(id, qty)`.
3. Se precisar craft: incluir receita em `recipes.js`.

### B) Novo building colocável
1. Criar `XManager.js` (place/resetAll/getColliders/raycastFromCamera se interativo).
2. Criar `XGhost.js` (mesh preview + valid/invalid).
3. Integrar em `Game.js`: tool id, ghost update, place on mouseup, consumir do slot.
4. UI: se abrir modal, criar overlay no `index.html` e handlers no `main.js`.

### C) Nova ferramenta / tier
1. Definir `ItemId` + `ITEMS` + stats em `recipes.js` (`TOOL_STATS`).
2. Gerar `meta` completo no output da receita.
3. Ajustar `Game._tryChop/_tryMine` para ler `meta.dmg` e consumir `meta.dur`.
4. `Player.js`: adicionar modelo em mão + seleção via `player.setTool(toolType, modelId)`.

## Debug / testes
- Pause menu tem toggle de performance.
- Forja UI mostra combustível/progresso em tempo real; slots atualizam via flag `dirty`.
- Para capturar screenshots de docs, preferir Puppeteer/Chromium container apontando para o host.
