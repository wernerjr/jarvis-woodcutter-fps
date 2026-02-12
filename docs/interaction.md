# Interação (F: toque / segurar)

## Regra geral
Interação com **estruturas colocadas** é sempre via **F** (nada de clicar nos objetos).

- **Toque em F (tap)**: executa a **ação principal** do alvo sob a mira (em alcance).
- **Segurar F (hold ~360ms)**: abre a **roda de ações** com opções contextuais; ao soltar F em uma opção, executa.
  - Segmentos sempre dividem o círculo igualmente: **360° ÷ N ações**.
- Sem alvo válido em alcance: **não mostra prompt** e **não abre roda**.
- Se `actionsCount == 0`: a roda **não é ativada/renderizada** (nem o círculo base).

## Prompt
Só aparece quando existe um alvo válido em alcance:
- `F: <AçãoPrincipal> • Segure F: mais opções`

## Ações por estrutura
### Fogueira (campfire)
- Tap F:
  - apagada → **Acender** (requer tocha equipada)
  - acesa → **Apagar**
- Hold F:
  - **Acender/Apagar** (conforme estado)
  - **Destruir**
- Não existe **Recolher** para fogueira.

### Forja (forge) / Mesa de Forja (forge table)
- Tap F: **Abrir**
- Hold F:
  - **Abrir**
  - **Recolher** (volta o item ao inventário e remove do mundo)
  - **Destruir**

## Implementação
- Seleção da roda é **100% angular** (centro→mouse): índice = `floor(angle / (360/N))`.
- `src/game/Game.js`: lógica de tap/hold + seleção angular da roda
- `src/game/UI.js`: `setInteractHint`, `setWheelActions`, `setWheelActive`
- `index.html` / `src/style.css`: overlay `#actionWheel` e estilo
