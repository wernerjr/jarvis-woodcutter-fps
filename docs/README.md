# Documentação — Jarvis Woodcutter FPS

## Sumário
- [1. Visão geral](#1-visão-geral)
- [2. Estrutura da documentação](#2-estrutura-da-documentação)
- [3. Para quem é cada seção](#3-para-quem-é-cada-seção)
- [4. Navegação rápida](#4-navegação-rápida)
- [5. Atualizações recentes (antes do roadmap atual)](#5-atualizações-recentes-antes-do-roadmap-atual)

## 1. Visão geral
Este diretório centraliza a documentação técnica, de funcionalidades e de negócio/game design do projeto **Jarvis Woodcutter FPS**.

Objetivo: facilitar onboarding, evolução de arquitetura e alinhamento entre engenharia, produto e design de jogo.

## 2. Estrutura da documentação
- `architecture/`: visão técnica da solução (contexto, containers, módulos, client e server).
- `features/`: documentação por funcionalidade, com fluxos, dados e APIs.
- `business/`: visão de negócio e Game Design Document (GDD).

## 3. Para quem é cada seção
- **Dev backend**: priorize `architecture/server.md`, `architecture/modules.md` e `features/*.md` com APIs.
- **Dev frontend/gameplay**: priorize `architecture/client.md`, `architecture/modules.md` e features de gameplay.
- **Game designer**: priorize `business/game-design.md` e features de loop/progressão.
- **Stakeholder de negócio**: priorize `business/overview.md`.

## 4. Navegação rápida
- Arquitetura
  - [Visão geral](./architecture/overview.md)
  - [Módulos e integrações](./architecture/modules.md)
  - [Client](./architecture/client.md)
  - [Server](./architecture/server.md)
- Funcionalidades
  - [Índice de features](./features/README.md)
- Negócio e design
  - [Visão de negócio](./business/overview.md)
  - [Game Design Document (GDD)](./business/game-design.md)

## 5. Atualizações recentes (antes do roadmap atual)
- **Auth v2 (P14) em andamento**:
  - guest único por dispositivo (`/api/auth/device/guest`),
  - cadastro/login por usuário e senha (`/api/auth/register`, `/api/auth/login`),
  - upgrade guest->conta com bloqueio de reuso guest no device.
- **Conta vinculada por código mágico (P11)** permanece apenas como histórico legado (descontinuado no runtime atual).
- **Inventário/Hotbar** evoluídos para modelo de atalho:
  - slot de mão fixo,
  - atribuição por teclado (hover + número),
  - drag-and-drop para hotbar,
  - remoção de atalho e sincronização automática com inventário real.
- **Consumo de maçã** corrigido:
  - funciona por inventário (duplo clique) e por hotbar (click),
  - ativa buff e animação de mão, consumindo do inventário real.
- **UX/imersão**:
  - bloqueio de interações durante loading,
  - bloqueio de seleção de texto e drag acidental na UI/canvas,
  - splash screen custom no menu principal (`/splash.png`).
- **Epic P12/P13 (Main Menu UI e rollout global de layout)**:
  - linguagem visual industrial aplicada ao menu e expandida para todos os menus/modais,
  - cards padronizados com blur(12px), borda `#444` e sombra principal,
  - botões padronizados com tipografia pesada uppercase + hover glow laranja,
  - protótipo single-file do P12 removido após incorporação no client real.
