# src/app/(auth)

Ecrãs de entrada. O grupo `(auth)` não aparece no endereço (ex.: `/entrar`).

| Ecrã | Endereço | Quando |
| --- | --- | --- |
| Entrar | `/entrar` | Sem sessão. Sem rede, explica que é preciso internet para entrar pela primeira vez. |
| Criar conta | `/criar-conta` | Nome completo (obrigatório), email e palavra-passe. Depois de criar, vai para "Verifica o teu email". |
| O teu nome | `/o-teu-nome` | Contas sem nome (antigas ou do site): pede o nome completo antes de abrir a app. |
| Verifica o teu email | `/verifica-email` | Explica que tem de abrir o link do email. |
| Esqueci-me da palavra-passe | `/recuperar-password` | Envia o email com o link `angolalocaliza://nova-password`. |
| Nova palavra-passe | `/nova-password` | Aberto pelo link do email de recuperação. |
| Email confirmado | `/email-confirmado` | Aberto pelo link do email de confirmação da conta. |
| Código MFA | `/codigo-mfa` | Staff com fator TOTP verificado, mas sessão AAL1: pede os 6 dígitos. |
| Ativar MFA | `/ativar-mfa` | Staff sem fator: QR + chave secreta (botão Copiar) + código. |

## Links do email (Supabase)

Os links do email voltam à app com a sessão no próprio endereço
(`#access_token=…&refresh_token=…&type=recovery|signup`). O `_layout.tsx` lê-o
(`src/services/links`) e abre a sessão com `setSession`. Se o link expirou, o
ecrã mostra "Este link expirou ou já foi usado. Pede um novo."

Endereços que têm de estar em **Supabase → Authentication → URL Configuration → Redirect URLs**:

- `angolalocaliza://nova-password`
- `angolalocaliza://email-confirmado`

O link de adesão (`angolalocaliza://adesao?token=…`) **não** passa pelo Supabase Auth
e não precisa de estar nessa lista.

## MFA

Qualquer utilizador com cargos tem de usar MFA (TOTP). Se lhe falta, os separadores
enviam-no para `/codigo-mfa` ou `/ativar-mfa` (`destinoDaSessao`). Depois de
confirmar o código, a sessão passa a AAL2 e a app abre.

Contas com MFA que recuperam a palavra-passe: o Supabase pode pedir AAL2 para mudar a
palavra-passe. O ecrã "Nova palavra-passe" mostra então "Escrever o código", que abre
`/codigo-mfa?depois=nova-password` e volta.
