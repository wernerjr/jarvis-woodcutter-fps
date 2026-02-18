# Conta vinculada e login por código mágico

## Objetivo
Permitir que jogador guest vincule progresso a um e-mail e recupere sessão em outro dispositivo.

## Fluxos principais
1. `POST /api/auth/link/start` (guest + email) → gera código temporário.
2. `POST /api/auth/link/verify` (guest + email + código) → vincula conta.
3. `POST /api/auth/login/start` (email) → gera código de login.
4. `POST /api/auth/login/verify` (email + código) → retorna `guestId` vinculado + token.

## Regras
- Código mágico com TTL curto e uso único.
- Proteção básica de tentativas por janela de tempo.
- Vínculo guest→conta com comportamento idempotente.

## Dados
- `accounts`
- `account_links`
- `magic_codes`

## Observação MVP
No ambiente atual, retorno pode incluir `devCode` para teste manual sem provedor de e-mail.
