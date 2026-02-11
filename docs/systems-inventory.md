# Sistema de inventário / hotbar

## Inventário
- Implementação: `src/game/Inventory.js`
- Regras:
  - 20 slots (`new Inventory({slots:20})`)
  - stack max 100
  - `add(id, qty)` retorna overflow (descartado) — Game normalmente dá toast.

## Hotbar
- Render/UI: `UI.renderHotbar()` em `src/game/UI.js`
- Regras:
  - 10 slots; slot 0 fixo `hand`
  - Drag-and-drop inventário↔hotbar quando inventário está aberto.

## Slots de ferramentas
Ferramentas usam `meta`:
```js
{ tool: 'axe'|'pickaxe', tier:'stone'|'metal', dmg:number, dur:number, maxDur:number }
```
A UI mostra durabilidade e dano resumidos.
