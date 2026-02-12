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
A entrada da mina no mundo externo fica **na borda** (face frontal) de um **paredão retangular** (face reta na entrada), virado para a floresta. O restante do volume é esculpido de forma **irregular** para ler como montanha, com o "dressing" caindo nas laterais até 0 (sem nada na frente do portal). As laterais e a parte de trás têm uma descida mais suave até o chão (sem aparência de parede reta). O dressing lateral cobre ~**4×** a largura do paredão.

Colisão: o bloqueio usa um perímetro denso (com leve irregularidade) e mantém uma abertura apenas no portal.

## Mina (interior)
- Layout maior, com caminho principal descendo e ramificações.
- Para imersão, o **chão do mundo externo** (plano y=0) é ocultado enquanto o player está dentro da mina.
- Suportes de madeira (postes + viga) acompanham a descida: postes vão até o piso e a viga acompanha o teto.
- No fim do caminho principal existe um aglomerado de pedras fechando visualmente a mina.
- Ao olhar para a entrada por dentro da mina, existe um "card" com imagem de floresta desfocada.
- Minério de ferro aparece como **veios na parede** (menores), sem rotação idle.

O portal é propositalmente simples: **3 peças de madeira** (2 postes + 1 viga), alinhado com a face.

Para manter a entrada sempre legível, existem **2 tochas infinitas** (sem durabilidade) fixadas nos postes (uma em cada lado), com luminosidade semelhante à tocha do jogador.

Regra visual: manter a área da entrada **limpa** (sem pedras/obstáculos na frente do portal).

Obs.: o caminho/trilha até a mina foi removido.

Config atual (2026-02-11):
- Tufo base ~0.15×0.225 e escala por instância (w ~0.10–0.15, h ~0.16–0.30)
- Objetivo: grama ≈ 1/4 do tamanho anterior e mais fina, mantendo densidade.

Dicas:
- Se ficar ralo demais: aumente levemente `instancesPerChunk` (+10–20%) ou reduza thinning (`if (rand() < 0.22)`).
- Se pesar GPU: reduza `instancesPerChunk` ou `viewDist`.
