# supabase/functions

Código das Edge Functions que estão neste repositório (fonte de verdade).
Publicar com o Supabase CLI (`supabase functions deploy <nome>`) ou pelo painel.
Estes ficheiros usam Deno e não entram no `tsc` da app (ver `tsconfig.json`).

| Função | O que faz |
| --- | --- |
| `generate-postal-code` | Código Postal Digital (`action=generate` e `action=validate`). As contas estão em `codigoPostal.ts`, que a app também usa nos testes para calcular exatamente o mesmo sem rede. |
| `geocode` | Província e município (`action=reverse`) e ordem de entregas (`action=optimize`) pela LocationIQ. A chave vem do segredo `LOCATIONIQ_KEY` (Supabase → Edge Functions → Secrets); sem ele, a função responde 500 com uma mensagem clara. A chave nunca aparece nas respostas. |
