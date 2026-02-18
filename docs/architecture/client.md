# Arquitetura do Client

## Sumário
- [1. Responsabilidades](#1-responsabilidades)
- [2. Componentes principais](#2-componentes-principais)
- [3. Fluxos principais no client](#3-fluxos-principais-no-client)
- [4. Integração com backend](#4-integração-com-backend)
- [5. Considerações de qualidade](#5-considerações-de-qualidade)

## 1. Responsabilidades
1. Renderização 3D do jogo e HUD.
2. Captura de input (movimento, interação, hotbar, inventário).
3. Simulação local de experiência de jogo (feedback visual/controle).
4. Persistência remota de estado e sincronização multiplayer.

## 2. Componentes principais
- `src/game/Game.js`: loop principal, estado da partida e integração de managers.
- `src/game/Player.js`: câmera FPS, movimentação, swing/impact window.
- `src/game/World.js`: ciclo dia/noite, sky shader e iluminação.
- `src/game/Inventory.js`: regras de slots/stacks.
- `src/game/UI.js`: render de inventário, hotbar, forja e menus.
- Managers especializados: árvores, pedras, mina, forja, mesa de forja, gramado etc.

## 3. Fluxos principais no client
### 3.1 Boot e sessão
1. Client inicia e prepara cena/UI.
2. Solicita guest/token ao server.
3. Abre websocket com `join`.
4. Recebe `welcome` + estado inicial de chunks.

### 3.2 Loop de gameplay
1. Captura input por frame.
2. Atualiza animações/câmera/interações locais.
3. Envia `input`/`worldEvent` para autoridade do server.
4. Aplica snapshots e `worldChunk` recebidos para reconciliação.

### 3.3 Progressão
1. Jogador coleta recursos.
2. Usa crafting/estações (forja/mesa).
3. Evolui ferramentas de pedra para metal.

## 4. Integração com backend
- REST para bootstrap e estado persistente.
- WebSocket para posicionamento e eventos de mundo em tempo real.
- Estratégia híbrida: UX fluida no client + validação crítica no server.

## 5. Considerações de qualidade
- **Performance**: evitar overdraw e excesso de meshes; priorizar instancing/culling.
- **Usabilidade**: controles consistentes e HUD objetiva.
- **Robustez**: reconexão WS e rehidratação de estado.
- **Evolução**: managers separados facilitam novas mecânicas sem acoplamento alto.
