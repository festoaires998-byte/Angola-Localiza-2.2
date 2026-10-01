# Backlog e dívida técnica

## Dívida técnica

### Site antigo mostra "Verificado!" depois de enviar a verificação simples

- **Desde:** 24/09/2026 (citizen-verify v3, PR #27).
- **O quê:** desde a v3, o envio da verificação simples já não aprova. Fica
  "Por rever" (`citizen_id_status = PENDING_REVIEW`) até um administrador
  decidir. O site antigo (repositório Huambo-Localiza-) ainda mostra
  "Verificado!" depois de enviar e, ao voltar a abrir, "Por verificar".
- **Impacto:** só na mensagem. O servidor continua a recusar registos de
  moradas até à aprovação.
- **Correção (hotfix no site):** ler `citizen-verify?action=status` e mostrar
  os 4 estados (por verificar / em revisão / verificado / recusado com o motivo),
  como a app faz.
- **Prioridade:** a seguir ao painel de revisão na app.

## Decidido, por fazer

### Retenção das fotos da verificação simples: 90 dias

As fotos do BI (frente e verso) e as selfies no bucket `kyc-artifacts` são
destruídas 90 dias depois da decisão (aprovação ou recusa). Fica só o
registo da decisão (`user_identity`, `audit_logs`) e das consultas
(`identity_artifact_views`).
- **Proposta:** uma tarefa diária no servidor (pg_cron ou função agendada)
  que apaga os ficheiros com `citizen_id_reviewed_at` com mais de 90 dias.

### Fechar a raiz do bucket kyc-artifacts (passo D)

- **Desde:** 24/09/2026 (migração `20260924050000_kyc_pasta_por_utilizador`).
- **O quê:** a app já envia as fotos para a pasta de cada pessoa
  (`<id>/…`). A regra do bucket ainda aceita a raiz, porque o site antigo
  envia para lá as fotos do cidadão e o KYC do pessoal (fotos e vídeo).
- **Depois do hotfix do site** (enviar para `<id>/…`): tirar da regra a
  condição `or position('/' in name) = 0`.

### Infraestrutura: SMTP próprio no Supabase

- **Desde:** 24/09/2026.
- **O quê:** o painel do Supabase só deixa ligar a proteção contra
  palavras-passe roubadas ("Leaked password protection") depois de
  configurar um servidor de email próprio (SMTP customizado).
- **Prioridade:** baixa; não bloqueia a operação atual. Depois do SMTP,
  ligar a proteção em Authentication → Passwords.

### Depois de validar o APK no terreno

- Publicar as Edge Functions por um workflow manual (sem a service role key).
- Guardar a estrutura completa da base de dados no repositório (migração inicial).
- Testes das Edge Functions a correr de verdade, com uma base de dados falsa
  (feito para a `deliveries` em `src/__tests__/deliveries.test.ts`; falta levar
  o mesmo às outras funções).
- Relatório de erros da app, leve, para gastar poucos dados.

### Site antigo: pedir o nome completo no registo

- **Desde:** a app passou a exigir o nome completo (user_metadata.full_name).
- **O quê:** quem cria conta no site ainda fica sem nome. A app pede-o no
  primeiro acesso ("Como te chamas?"), mas o site devia pedi-lo no registo,
  com o mesmo campo (`options.data.full_name`).

### Entregas: pendências encontradas na auditoria (Fase 2)

- **Desde:** 24/09/2026 (deliveries v19, migração `20260924060000_seguranca_entregas`).
- **Site antigo (hotfix):** enviar as fotos e as assinaturas das provas para o
  bucket privado `delivery-proofs` (`<id>/…`), como a app. Até lá, a v19 ainda
  aceita `field-photos` (público). Depois do hotfix: deixar de aceitar
  `field-photos` nas provas e tirar as 2 fotos de provas antigas de lá.
- ~~**Rastreio público.**~~ Decidido (01/10): sim, mínimo. Já existe na
  deliveries v38 (`action=track`: estado, datas, município/província e histórico).
- ~~`sync`: `create_address` e `update_address` gravam o payload tal como vem.~~
  Corrigido na sync v8 e na migração `20260924070000_moradas_so_por_validar`.
- ~~**`signing-keys`:** a chave de um aparelho pode ser trocada sem registo.~~
  Feito na signing-keys v5 (cada registo e troca em `audit_logs`). Na mesma
  altura (01/10) criou-se a coluna `signing_keys.revoked_at`, que a deliveries
  já lia desde 27/09 sem ela existir (as provas assinadas ficavam todas por
  verificar).
- **`public-api`:** as organizações criam entregas com a chave da API, sem a
  verificação de identidade (decisão A vale para cidadãos). Confirmar que é o
  que se quer.
- **PIN e entrega sem rede (decisão D):** se a prova só subir depois das 72 h,
  o servidor responde `PIN_EXPIRED` e o remetente tem de gerar um PIN novo.
- **Atribuição (decisão B):** o operador postal atribuir e o estafeta "puxar"
  entregas elegíveis vão no PR do separador Entregas.

### Pesquisa e privacidade (PR #43)

- ~~Funções antigas `search` e `resolve-address` sem privacidade~~: desativadas
  (410); o site passa a usar a `pesquisa` (PR no repositório do site).
- ~~Acentos na pesquisa~~: resolvido (`unaccent`, migração `20260924080000`).
- ~~Leitura direta da tabela `addresses` mostrava moradas privadas~~:
  corrigido na migração `20260924090000_moradas_privadas_rls` e na deliveries v20.
- **Avisos do relatório de segurança do Supabase (antigos):** `is_admin`
  pode ser chamada pela API (só diz se um id é administrador); a extensão
  PostGIS está no esquema `public` (e com ela `spatial_ref_sys` sem RLS e as
  funções `st_estimatedextent`); a tabela `identity_artifact_views` tem RLS sem
  regras (ninguém lê pela API: está bem assim, mas documentar).
  **30/09:** o `REVOKE` na `spatial_ref_sys` não tem efeito (a tabela é do
  `supabase_admin`; `anon`/`authenticated` continuam com INSERT/UPDATE/DELETE).
  Só se resolve com o suporte do Supabase ou mudando a PostGIS de esquema
  (ver a migração `20260929122000_restrict_postgis_metadata_rest.sql`).
- **`public-api` (`/v1/address/search`):** lê `addresses` e `streets` para as
  organizações (com a chave da API). Confirmar que respeita a privacidade.
- **Segredos no código (encontrados na auditoria):** a `identity-kyc` tem o
  "pepper" do KYC escrito no código; a `phone-verify` tem a chave pública
  escrita no código (devia vir do ambiente, como na `sync`). Passar para os
  segredos das Edge Functions.
  **30/09 — continua por fazer:** o pepper da `identity-kyc` (v6) ainda está no
  código porque os segredos só se criam no painel do Supabase (Edge Functions →
  Secrets → `KYC_PEPPER`); depois basta ler `Deno.env.get("KYC_PEPPER")` com o
  valor atual como alternativa, para não invalidar os pedidos já feitos.
- **Favorito do Mapa sem província/município:** o "Guardar como favorito" cria
  a morada sem `province_id`/`municipality_id` (o site procurava pelo nome). O
  validador completa na validação.

### Enviar: a seguir

- **Destino fora das moradas guardadas (app):** o site já aceita Plus Code,
  GPS e link (cria uma morada própria por validar e usa o id dela); falta o
  mesmo na app.
- ~~**Pedido repetido.**~~ Resolvido: a app manda o mesmo `sync_operation_id`
  com e sem rede, a deliveries devolve a entrega já criada e a base de dados
  tem um índice único (`deliveries_sync_operation_id_uidx`).

### Entregas do estafeta: a seguir

- ~~**Decisão B (atribuição).**~~ Decidido (01/10): os dois. Já existe:
  `assign_driver`/`list_org_drivers` (operador) e `list_available_for_driver`/
  `accept_delivery` (estafeta), na deliveries e na app.
- **Destino no mapa:** o estafeta só lê a posição de moradas publicadas/aprovadas
  (regras da tabela addresses). Para moradas ainda por validar, falta dar a
  posição do destino ao estafeta atribuído (ex.: pela `deliveries`).
- **Mapa dentro da app:** "Abrir o destino no mapa" usa a app de mapas do
  telemóvel; falta mostrar o destino no mapa offline da app.
