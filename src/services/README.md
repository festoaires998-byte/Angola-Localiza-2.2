# src/services

Hardware e nativo.

- `cofre/` — sessão cifrada e identificador do aparelho (ver o README da pasta).
- `rede/` — há internet? (`@react-native-community/netinfo`).
- `moradas/` — separador Moradas: os favoritos do utilizador guardados no telemóvel (funcionam sem
  rede). `moradas.ts` tem a lógica (testada com SQLite real); `moradasApp.ts` liga-a à base de dados
  e ao Supabase. Mudar o nome/categoria ou tirar dos favoritos sem rede fica marcado no favorito
  (`pendente`) e vai para o servidor quando houver rede, antes de a lista ser trazida de novo.
- `moradas/registo.ts` — registar uma morada nova: ruas da quadra (guardadas em `referencias` para
  usar sem rede), morada duplicada perto, verificação do cidadão (guardada em `preferencias`), foto
  (`ficheiros_pendentes`, bucket `field-photos`) e envio pela fila como `field_submit`.
- `identidade/verificacao.ts` — verificação simples com **envio próprio** (funciona sem rede): o pedido
  (3 fotos + o que já subiu) fica em `preferencias`; com rede sobe cada foto para o bucket privado
  `kyc-artifacts` (continua onde parou se a rede cair) e chama `citizen-verify?action=submit`. Os
  gatilhos da sincronização (`src/sync/gatilhos.ts`) enviam-no antes da fila, para os registos de
  moradas já encontrarem a pessoa verificada no servidor.

