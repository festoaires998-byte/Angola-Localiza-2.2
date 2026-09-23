# src/api

Ligação ao Supabase. Sem ecrãs: só funções.

| Ficheiro | Para que serve |
| --- | --- |
| `supabase.ts` | O cliente único (`supabase`). Sessão guardada cifrada (`src/services/cofre`), renovação automática só com a app em primeiro plano. |
| `auth.ts` | Entrar, criar conta, recuperar/definir palavra-passe, sair, MFA TOTP e link de adesão. |
| `errosAuth.ts` | `traduzirErroAuth()`: erros do Supabase Auth em português (as mesmas traduções do site). |
| `adesao.ts` | Regras do link de adesão (quando apagar o token). |
| `perfil.ts`, `perfilNucleo.ts` | `carregarPerfil()`: cargos e KYC, com o último perfil guardado quando não há rede. |
| `edge/chamarFuncao.ts` | `POST /functions/v1/<nome>?action=<acao>` com o token da sessão. |

## Configuração

`EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` no ficheiro `.env`
(ver `.env.example`). Se faltarem, a app pára com um erro em português
(`src/config/env.ts`). Nos testes são usados valores falsos.

Polyfill: `react-native-url-polyfill/auto` e `lock: processLock`, como pede a
documentação do Supabase para Expo/React Native.

## Erros

As funções de `auth.ts` lançam `ErroAuth`. A `message` já vem traduzida e pode
ser mostrada; a original fica em `erro.original`.

## MFA (TOTP)

1. `inscreverTotp()` → `{ factorId, qrCode, uri, segredo }`. O ecrã mostra o QR
   **e sempre** a chave `segredo` como alternativa (para escrever à mão).
2. `desafiarEVerificarTotp(factorId, codigo)` (ou `desafiarTotp` + `verificarTotp`).
3. `listarFatores()` (precisa de rede) e `nivelGarantia()` (AAL1/AAL2, lido do token
   guardado, sem rede).

Qualquer utilizador com cargos tem de estar em AAL2 para ver mais do que mapa e definicoes.

## Link de adesão

1. Ao abrir o link: `guardarTokenAdesaoPendente(token)` (fica no `expo-secure-store`).
2. `entrar()` (e `criarConta()` quando já há sessão) chama `consumirAdesaoPendente()`,
   que faz `POST /functions/v1/join-link?action=consume` com `{ token }`.
3. O token é apagado se correu bem ou se o servidor diz que o link não serve
   (404, 410, ...). Se falhou por rede, sessão (401) ou erro do servidor (5xx),
   fica guardado para a próxima vez.

## Perfil (cargos e KYC)

`carregarPerfil()`:
- cargos: `organization_members` (`select=role`, só as linhas do próprio utilizador);
- KYC: `POST /functions/v1/identity-kyc?action=status`, só para staff que não seja super_admin;
- corre bem → grava em `perfil_local` (`confirmadoAgora: true`);
- falha qualquer parte → não grava nada e devolve o último guardado (`confirmadoAgora: false`),
  ou `perfil: null` se nunca houve nenhum.

## Sair

`sair()` termina a sessão (no servidor e, sem rede, pelo menos no telemóvel).
**Não apaga a fila de saída.** O ecrã deve avisar antes com
`fila.contarPendentesDoUtilizador(userId)`.
