# Documentação — Jarvis Woodcutter FPS

## Sumário
- [1. Visão geral](#1-visão-geral)
- [2. Estrutura da documentação](#2-estrutura-da-documentação)
- [3. Para quem é cada seção](#3-para-quem-é-cada-seção)
- [4. Navegação rápida](#4-navegação-rápida)

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
