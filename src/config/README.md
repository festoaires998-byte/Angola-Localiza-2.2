# src/config

Variáveis de ambiente e constantes.

- `env.ts` — `obterConfigSupabase()` lê `EXPO_PUBLIC_SUPABASE_URL` e
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Se faltarem, dá um erro claro em português.
  Nos testes devolve valores falsos.
