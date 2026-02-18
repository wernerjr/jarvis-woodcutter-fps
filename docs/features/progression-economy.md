# Feature — Loop de progressão e economia de recursos

## Objetivo
Definir o ciclo principal de progressão: coletar recursos, craftar ferramentas melhores e desbloquear eficiência no gameplay.

## Fluxos principais
1. Coletar recursos básicos (madeira, pedra, fibras).
2. Craftar ferramentas iniciais de pedra.
3. Explorar mina para obter `iron_ore`.
4. Processar minério na forja para `iron_ingot`.
5. Usar mesa de forja para criar ferramentas de metal.
6. Repetir loop com maior eficiência e novos objetivos.

Pseudo-diagrama:
```text
Exploração -> Coleta -> Craft -> Ferramenta melhor -> Coleta mais rápida -> Progressão
```

## Entidades/dados
- Itens: `log`, `stick`, `leaf`, `iron_ore`, `iron_ingot`, ferramentas.
- Inventário/hotbar com stack e durabilidade (meta de tool).
- Estado persistido em `player_state`.

## APIs/métodos chamados
- Persistência de progresso: `GET|PUT /api/player/state`
- Estados de estação: `GET|PUT /api/forge/state`
- Sincronização multiplayer: `worldEvent` por WS

## Performance, segurança e edge cases
- Controle de stack evita expansão ilimitada de slots.
- Durabilidade obriga decisão econômica (reparar/substituir/progredir).
- Eventos de coleta sujeitos a validação de alcance/rate no servidor.
