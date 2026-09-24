# Angola Localiza — regras do projeto

App Expo + TypeScript + expo-router, offline-first, com Supabase. Todo o texto
da app em português de Angola, botões grandes e contraste alto. Explicar as
coisas ao dono do projeto em português simples.

## Regras

- **Builds da Expo (EAS) só quando o dono pedir.** O saldo de dados é curto:
  nunca correr o workflow `build-android.yml` nem `eas build` por iniciativa própria.
- **Merge de PR só com autorização explícita do dono**, dada para cada PR.
- **Cada PR tem testes para tudo o que muda** (Jest: lógica, base de dados local
  com sql.js e ecrãs).
- **A descrição de cada PR segue `.github/pull_request_template.md`**, com as
  secções "Como foi testado" e "O que só se pode testar num telemóvel real".
- Antes de enviar: `npx tsc --noEmit` e `npm test` sem erros.
- Nunca criar nem usar um segredo `SUPABASE_SERVICE_ROLE_KEY` nos workflows
  (dá acesso total à base de dados). Os mapas usam as chaves S3 do Storage.
- Nunca escrever chaves ou palavras-passe no código nem nos registos.
- Mudanças no Supabase (funções, tabelas) só com o pedido do dono; a app e o
  site usam as mesmas funções.

## Testes

- `npm test`: Jest (lógica, base de dados local com sql.js, ecrãs).
- `npx tsc --noEmit`: tipos.
- O que não se pode provar com testes automáticos (GPS verdadeiro, câmara,
  instalação do APK…) vai na secção "O que só se pode testar num telemóvel
  real" da descrição do PR.
