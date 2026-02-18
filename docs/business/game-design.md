# Game Design Document (GDD) — Jarvis Woodcutter FPS

## Sumário
- [1. Visão geral](#1-visão-geral)
- [2. Mecânicas principais](#2-mecânicas-principais)
- [3. Estética e direção audiovisual](#3-estética-e-direção-audiovisual)
- [4. Estrutura de níveis/modos](#4-estrutura-de-níveismodos)
- [5. Personagens, inimigos e itens](#5-personagens-inimigos-e-itens)

## 1. Visão geral
- **Tema/Fantasia**: sobrevivência e progressão artesanal em ambiente low-poly.
- **Gênero**: FPS de coleta/crafting com multiplayer leve.
- **Referências**: loops de survival/crafting simplificados para sessões curtas.

Pilar de experiência:
1. Entrar rápido (guest).
2. Entender rápido (objetivos claros de progressão).
3. Evoluir de forma tangível (ferramentas melhores).

## 2. Mecânicas principais
### 2.1 Core loop
1. Explorar mundo.
2. Coletar recursos.
3. Craftar/usar estruturas.
4. Evoluir equipamentos.
5. Repetir com maior eficiência.

### 2.2 Progressão
- Tier inicial: pedra/madeira.
- Tier intermediário: mineração de ferro.
- Tier avançado atual: ferramentas de metal.

### 2.3 Desafios
- Gestão de inventário e slots.
- Timing de produção na forja.
- Competição/coordenação por recursos no mundo compartilhado.

## 3. Estética e direção audiovisual
### 3.1 Direção de arte
- Visual **low-poly legível**, foco em silhueta e contraste.
- Evitar excesso de ruído visual que prejudique leitura de gameplay.

### 3.2 Paleta e iluminação
- Paleta natural (verdes/terrosos) com variação de ciclo dia/noite.
- Fog e luz para profundidade e orientação espacial.

### 3.3 UI/UX
- HUD minimalista (hotbar/inventário/contextual prompts).
- Interações com teclas consistentes (`F`, `ESC`, `I`, `C`, hotkeys numéricas).

### 3.4 Som e trilha
- Não há subsistema de áudio detalhado implementado no backend.
- Diretriz: áudio funcional para feedback de ação (coleta, hit, crafting), trilha ambiente discreta.

## 4. Estrutura de níveis/modos
- **Modo atual**: mundo contínuo com áreas funcionais (floresta, mina, áreas de construção).
- **Estratégia de expansão**:
  1. Novos biomas.
  2. Eventos sazonais.
  3. Modos cooperativos/objetivos por sessão.

## 5. Personagens, inimigos e itens
### 5.1 Personagens
- Jogador guest customizável no futuro (atualmente foco em mecânica).

### 5.2 Inimigos
- Não há sistema de inimigos combatentes implementado no estado atual.
- Espaço de evolução: PvE leve, criaturas territoriais, raids de área.

### 5.3 Itens e papéis
- **Recursos base**: madeira, graveto, folha.
- **Recursos de progressão**: minério e barra de ferro.
- **Ferramentas**: aumentam dano/eficiência e trazem escolha via durabilidade.
