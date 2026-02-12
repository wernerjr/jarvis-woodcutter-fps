# Limite do mapa: rio

O perímetro do mapa é delimitado por um **rio** (visual) + **colisores** (barreira física). A ideia é dar um limite natural e impedir o player de sair da área jogável.

## Implementação
- Visual + colisores: `src/game/RiverManager.js`
- Integração:
  - `Game.start()` inicializa: `this.river.init({ radius, width, segments })`
  - `Game._loop()` adiciona `this.river.getColliders()` na lista de colisores quando fora da mina.

## Ajustes rápidos
- `radius`: quão longe do centro fica o loop do rio.
- `width`: largura visual do rio.
- `segments`: resolução/curvas (mais = mais suave, custo um pouco maior).

## Colisão
- Usamos uma sequência de **círculos XZ** ao longo da margem interna do rio.
- Objetivo: não ter gaps. Se notar fuga em algum ponto:
  - aumente `segments` ou
  - aumente `width` ou
  - aumente o raio do collider (`hw * 0.55`).
