# Ambiente (iluminação, visibilidade e grama)

## Grass settings (size/density)
Implementação: `src/game/GrassManager.js`

Parâmetros principais:
- `bladeGeo`: tamanho base do tufo (largura/altura do plano)
- `h` / `w`: escala por instância (altura e largura) — **afinamos reduzindo `w` mais que `h`**
- `instancesPerChunk`: densidade por chunk
- `viewDist`: distância de render (culling por chunk)
- `clear[]`: círculos para limpar grama em áreas de gameplay (spawn, trilha, mina). Se você mover a entrada/trilha da mina, atualize esses pontos (ex.: novos waypoints da trilha).

## Mina (entrada)
A entrada da mina no mundo externo é um **módulo** coerente com a montanha: a montanha é um mound low‑poly e a boca da mina é um pequeno “cliff-face” com túnel visível e luzes quentes internas. Isso evita a sensação de “porta conectada a nada”.

Config atual (2026-02-11):
- Tufo base ~0.15×0.225 e escala por instância (w ~0.10–0.15, h ~0.16–0.30)
- Objetivo: grama ≈ 1/4 do tamanho anterior e mais fina, mantendo densidade.

Dicas:
- Se ficar ralo demais: aumente levemente `instancesPerChunk` (+10–20%) ou reduza thinning (`if (rand() < 0.22)`).
- Se pesar GPU: reduza `instancesPerChunk` ou `viewDist`.
