# Auth v2 — Guest por dispositivo + Usuário/Senha

## Objetivo
Substituir o fluxo de código mágico por um modelo com:
- guest único por dispositivo,
- login por usuário/senha,
- upgrade irreversível de guest para conta.

## Fluxos principais
1. `POST /api/auth/device/guest`
   - recebe `deviceKey` (+ `worldId` opcional),
   - retorna guest existente do dispositivo ou cria novo.
2. `POST /api/auth/register`
   - cria conta com `username/password`,
   - opcionalmente vincula `guestId` (upgrade guest->conta).
3. `POST /api/auth/login`
   - login com `username/password`,
   - retorna sessão compatível com gameplay atual (`guestId` + token).

## Regras atuais
- `deviceKey` único por equipamento (persistido no client).
- `username_norm` único (case-insensitive por normalização).
- quando há upgrade de guest:
  - vínculo do dispositivo guest é marcado como migrado/inativo,
  - próximo acesso deve ser por usuário/senha.

## Dados (Auth v2)
- `users`
- `devices`
- `device_guest_links`

## Compatibilidade
- Persistência de gameplay continua baseada em `guestId` neste estágio.
- Rotas legadas de código mágico foram removidas do bootstrap e do source.
