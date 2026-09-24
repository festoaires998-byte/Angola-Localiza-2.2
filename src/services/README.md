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

