# Forja (Fornalha) e Mesa de Forja

## Persistência (server-side)
- O estado interno da forja (fuel/input/output + enabled/burn/prog) é salvo no backend por `worldId+forgeId`.
- Ao abrir a forja, o server aplica um **catch-up** pelo tempo decorrido (offline):
  - consome combustível
  - consome minério
  - produz barras se houver espaço
  - para se combustível ou input acabar (ou se output estiver cheio)
- Esse catch-up é **sob demanda** (sem cron) quando a forja é consultada/aberta.

## Forja (Fornalha) — smelting
- Código: `src/game/ForgeManager.js`, UI em `src/game/UI.js` (modal #forge).
- Entrada:
  - Combustível: tronco/galho/folha (tempo de queima por item)
  - Input: minério de ferro
- Saída: barras de ferro
- Regras:
  - Precisa clicar em **Iniciar fundição** (estado `enabled`).
  - **Desligar** é sempre permitido.
  - Ligar requer combustível + minério.
  - **Auto-desligamento:** se a forja estiver ligada e acabar o **minério** (entrada vazia) **ou** acabar o **combustível** (burn zerado e sem itens de combustível), ela desliga automaticamente.
  - Processa enquanto houver combustível + minério + espaço.
  - UI atualiza em tempo real (status por tick + slots via flag `dirty`).
  - VFX: fogo e fumaça apenas quando processamento está ativo.

## VFX (360°)
Os planos de fogo/fumaça são **DoubleSide** e fazem **billboard** para a câmera (assim aparecem de todos os ângulos).

## Mesa de Forja — crafting de metal
- Código: `src/game/ForgeTableManager.js` (+ ghost).
- UI: modal `#forgeTable` (lista de receitas metal).
- Restrições:
  - Receitas de metal ficam em `FORGE_TABLE_RECIPES` (não aparecem no crafting básico).
  - Requer barras vindas da fornalha.
