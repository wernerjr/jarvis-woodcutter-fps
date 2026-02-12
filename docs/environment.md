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
A entrada da mina no mundo externo fica **na borda** (face frontal) de um **paredão retangular** (face reta na entrada), virado para a floresta. Ao redor do paredão, o volume é esculpido para ler como montanha, com o "dressing" caindo nas laterais até 0 (sem nada na frente do portal).

O portal é propositalmente simples: **3 peças de madeira** (2 postes + 1 viga), alinhado com a face.

Para manter a entrada sempre legível, existem **2 tochas infinitas** (sem durabilidade) fixadas nos postes (uma em cada lado), com luminosidade semelhante à tocha do jogador.

Obs.: o caminho/trilha até a mina foi removido.

Config atual (2026-02-11):
- Tufo base ~0.15×0.225 e escala por instância (w ~0.10–0.15, h ~0.16–0.30)
- Objetivo: grama ≈ 1/4 do tamanho anterior e mais fina, mantendo densidade.

Dicas:
- Se ficar ralo demais: aumente levemente `instancesPerChunk` (+10–20%) ou reduza thinning (`if (rand() < 0.22)`).
- Se pesar GPU: reduza `instancesPerChunk` ou `viewDist`.
