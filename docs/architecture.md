# Arquitetura (curta)

## Stack
- Vite + Vanilla JS (ESM)
- Three.js (render)
- UI: DOM/HTML/CSS (sem framework)
- Deploy: build estático (`dist/`) servido por Nginx em Docker

## State machine
- `Game.state`: `menu|playing|paused|inventory|crafting|forge|forgeTable|controls-*`
- Fora de `playing`, a maioria da simulação usa `simDt=0`.
- Exceções controladas: forja aberta roda com `forgeDt`.

## Onde estender
- Novo item/receita: `items.js` + `recipes.js`.
- Novo conteúdo do mundo: criar manager `XManager.js` + integrar em `Game` (init/update/colliders/raycast).
- Nova UI/modal: `index.html` + handlers em `main.js` + renderers em `UI.js`.

## Nota: interior da mina
O interior da mina existe no mesmo `scene`, porém fica **invisível** enquanto o player está no mundo externo. Ao entrar no portal, o `Game` habilita a visibilidade via `MineManager.setInteriorVisible(true)`.
