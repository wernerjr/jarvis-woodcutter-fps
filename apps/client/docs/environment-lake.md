# Ambiente: lago (fechamento do rio)

Em um trecho do perímetro, a curva do rio pode dar a impressão de “fim”/costura visual. Para resolver isso (sem tentar forçar o rio a fechar perfeito), adicionamos um **lago** que “fecha” a composição.

## Objetivo
- Remover a percepção de que o rio termina antes de conectar.
- O limite jogável continua sendo o **rio** (barreira natural). O lago é **visual** (remanso), sem colisão própria.

## Implementação
- Visual + colisores: `src/game/LakeManager.js`
  - Mesh do lago é um **blob orgânico** (não é elipse perfeita), gerado por um shape com wobble (parece mais natural/serpenteante).
  - Material é igual ao do rio.
  - Colisão: **desativada** (lago visual-only). A barreira do mapa é implementada exclusivamente pelo rio.
- Integração:
  - `Game.start()` inicializa o lago: `this.lake.init(...)`
  - `Game._loop()` adiciona `lake.getColliders()` junto com os colliders do rio (fora da mina).

## Ajustes
- Posição e tamanho: `center` e `baseR` em `LakeManager` (o lago é um blob orgânico).
- Distância que o player consegue chegar da água:
  - ajuste `colliderBands` (offset/raios). Um offset levemente **negativo** coloca o colisor mais para dentro do lago, permitindo chegar mais perto da margem.
- Se houver vazamento (raro), aumente um pouco os raios das faixas e/ou os midpoints.
