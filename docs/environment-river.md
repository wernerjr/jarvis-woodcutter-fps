# Limite do mapa: rio

O perímetro do mapa é delimitado por um **rio** (visual) + **colisores** (barreira física). A ideia é dar um limite natural e impedir o player de sair da área jogável.

## Implementação
- Visual + colisores: `src/game/RiverManager.js`
  - Altura Y do rio: ~`0.02` (ligeiramente acima do chão para não ficar enterrado)
- Integração:
  - `Game.start()` inicializa: `this.river.init({ radius, width, segments })`
  - `Game._loop()` adiciona `this.river.getColliders()` na lista de colisores quando fora da mina.

## Ajustes rápidos
- `radius`: quão longe do centro fica o loop do rio.
- `width`: largura visual do rio.
- `segments`: resolução/curvas (mais = mais suave, custo um pouco maior).

## Grama (faixa de exclusão)
A grama mantém o comportamento normal no mapa inteiro, e é limpa **apenas** em uma **faixa anelar** cobrindo o leito do rio.
- Implementação: `src/game/GrassManager.js` (`isClear`)
- Ajuste os raios `86..104` se mudar `radius/width` do rio.

## Loop fechado
O rio é gerado como um strip fechado (último ponto duplica o primeiro) e os índices conectam até o último segmento.
Se notar “fenda” visual no seam:
- aumente `segments` e/ou
- reduza levemente a amplitude do wobble.

## Colisão
- Usamos uma sequência de **círculos XZ** ao longo da margem interna do rio.
- Objetivo: não ter gaps. Se notar fuga em algum ponto:
  - aumente `segments` ou
  - aumente `width` ou
  - aumente o raio do collider (`hw * 0.55`).
