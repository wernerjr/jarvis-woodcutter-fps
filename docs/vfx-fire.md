# VFX — fogo (tocha e fogueira)

## Objetivo
Chamas low‑poly legíveis (sem partículas pesadas/alpha textures). Usamos um **cone emissivo** animado por escala/opacity/intensity.

## Tocha do player
- Código: `src/game/Player.js` → `_makeTorch()`
- Implementação: `THREE.ConeGeometry` + `MeshStandardMaterial` emissivo.
- Orientação: cone aponta para **+Y** (para cima). A posição é ajustada para a base ficar na “cabeça” da tocha.
- Flicker/visibilidade: controlado por `Game` via `player.setTorchFlicker(flicker, heat01)`.

## Fogueira
- Código: `src/game/CampfireManager.js` → `makeCampfireMesh()`
- Implementação: mesmo padrão (cone emissivo) maior.
- Orientação: cone aponta para **+Y** (base embaixo, fogo subindo).

## Ajustes comuns
- Tamanho: altere os parâmetros do `ConeGeometry(raio, altura, segmentos)`.
- Posição: ajuste `flame.position.y` para alinhar a base com a lenha/ember.
- Brilho: ajuste `emissiveIntensity` e `opacity` (ou o cálculo de flicker).
