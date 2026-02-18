# Inventário/Hotbar e UX de interação

## Resumo
O sistema de hotbar funciona como **atalho** para itens do inventário (não como inventário separado).

## Comportamentos implementados
- Slot da mão é fixo (não editável).
- Atalhos podem ser atribuídos por:
  - hover no item + tecla numérica,
  - drag do inventário para hotbar.
- Um mesmo item fica em no máximo 1 slot de hotbar.
- Se item acabar/remover do inventário, atalho é limpo automaticamente.

## Interações de inventário
- Clique seleciona slot.
- Duplo clique robusto (com fallback por tempo) para quick action (ex.: consumir maçã).
- Equipamentos com layout compacto e tooltip por slot.

## UX adicional
- Hotbar compacta espelhada dentro do modal de inventário.
- Interações bloqueadas durante loading.
- Seleção de texto/drag acidental bloqueados para preservar imersão.
