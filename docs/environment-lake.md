# Ambiente: lago (fechamento do rio)

Em um trecho do perímetro, a curva do rio pode dar a impressão de “fim”/costura visual. Para resolver isso (sem tentar forçar o rio a fechar perfeito), adicionamos um **lago** que “fecha” a composição.

## Objetivo
- Remover a percepção de que o rio termina antes de conectar.
- Manter a regra de gameplay: **água = barreira natural** (não atravessável).

## Implementação
- Visual + colisores: `src/game/LakeManager.js`
  - Mesh do lago é um **blob orgânico** (não é elipse perfeita), gerado por um shape com wobble (parece mais natural/serpenteante).
  - Material é igual ao do rio.
  - Colisão: círculos XZ ao longo do perímetro do blob + midpoints, com 2 faixas para evitar vazamento em diagonal.
- Integração:
  - `Game.start()` inicializa o lago: `this.lake.init(...)`
  - `Game._loop()` adiciona `lake.getColliders()` junto com os colliders do rio (fora da mina).

## Ajustes
- Posição e tamanho: `center`, `rx`, `rz` em `LakeManager`.
- Se houver vazamento (raro), aumentar raio das faixas em `colliderBands`.
