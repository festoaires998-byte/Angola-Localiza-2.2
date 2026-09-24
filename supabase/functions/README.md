# supabase/functions

Código das Edge Functions que estão neste repositório (fonte de verdade).
Publicar com o Supabase CLI (`supabase functions deploy <nome>`) ou pelo painel.
Estes ficheiros usam Deno e não entram no `tsc` da app (ver `tsconfig.json`).

| Função | O que faz |
| --- | --- |
| `generate-postal-code` | Código Postal Digital (`action=generate` e `action=validate`). As contas estão em `codigoPostal.ts`, que a app também usa nos testes para calcular exatamente o mesmo sem rede. |
| `geocode` | Província e município (`action=reverse`) e ordem de entregas (`action=optimize`) pela LocationIQ. A chave vem do segredo `LOCATIONIQ_KEY` (Supabase → Edge Functions → Secrets); sem ele, a função responde 500 com uma mensagem clara. A chave nunca aparece nas respostas. |
| `field-service` | Levantamento de campo e registo de moradas pelo cidadão: `submit`, `check_duplicates`, `list_streets_in_quadra`, `list_pending`, `validate` (aprovar/rejeitar/fundir), `set_street_mode`, `close_quadra`, etc. O código postal da aprovação usa `codigoPostal.ts`, **cópia exata** do da `generate-postal-code` (esquema 2); o teste `src/__tests__/fieldService.test.ts` falha se as duas cópias forem diferentes. Publicar os dois ficheiros (`index.ts` e `codigoPostal.ts`), com `verify_jwt` desligado como antes (a função valida a sessão). |

