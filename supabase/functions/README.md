# supabase/functions

Código das Edge Functions que estão neste repositório (fonte de verdade).
Publicar com o Supabase CLI (`supabase functions deploy <nome>`) ou pelo painel.
Estes ficheiros usam Deno e não entram no `tsc` da app (ver `tsconfig.json`).

| Função | O que faz |
| --- | --- |
| `generate-postal-code` | Código Postal Digital (`action=generate` e `action=validate`). As contas estão em `codigoPostal.ts`, que a app também usa nos testes para calcular exatamente o mesmo sem rede. |
| `geocode` | Província e município (`action=reverse`) e ordem de entregas (`action=optimize`) pela LocationIQ. A chave vem do segredo `LOCATIONIQ_KEY` (Supabase → Edge Functions → Secrets); sem ele, a função responde 500 com uma mensagem clara. A chave nunca aparece nas respostas. |
| `field-service` | Levantamento de campo e registo de moradas pelo cidadão: `submit`, `check_duplicates`, `list_streets_in_quadra`, `list_pending`, `validate` (aprovar/rejeitar/fundir), `set_street_mode`, `close_quadra`, etc. O código postal da aprovação usa `codigoPostal.ts`, **cópia exata** do da `generate-postal-code` (esquema 2); o teste `src/__tests__/fieldService.test.ts` falha se as duas cópias forem diferentes. A aprovação e a fusão gravam também o `plus_code` (10 dígitos) com `plusCode.ts`, **cópia exata** de `src/domain/enderecamento/plusCode.ts` (o mesmo teste compara). Publicar os três ficheiros (`index.ts`, `codigoPostal.ts` e `plusCode.ts`), com `verify_jwt` desligado como antes (a função valida a sessão). |
| `citizen-verify` | Verificação simples do cidadão (BI frente, BI verso e selfie no bucket privado `kyc-artifacts`). `status`: estado de quem pede. `submit`: confirma no Storage (função SQL `kyc_artefactos_do_utilizador`) que as 3 fotos existem e foram enviadas por quem pede e põe a verificação **por rever** (`citizen_id_status = PENDING_REVIEW`); **não aprova sozinha**. `list_pending` e `review` (aprovar/recusar com motivo): só administradores (`is_admin`). As regras puras estão em `regras.ts` (testadas em `src/__tests__/citizenVerify.test.ts`). Publicar `index.ts` e `regras.ts`, com `verify_jwt` desligado. Precisa da migração `supabase/migrations/20260924020000_verificacao_cidadao_por_rever.sql` aplicada **antes**. |


## supabase/migrations

Mudanças na base de dados, pela ordem do nome. Aplicar **antes** de publicar a
função que precisa delas (e só com o pedido do dono).
