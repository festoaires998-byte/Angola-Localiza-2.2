// Colunas de algumas tabelas, como estão na base de dados do Supabase.
// O Supabase falso usa-as para dar erro quando uma função pede uma coluna
// que não existe (como o PostgREST faz). Atualizar quando uma migração
// acrescenta ou tira colunas destas tabelas.

/** public.signing_keys (revoked_at: migração 20261001090000_signing_keys_revogacao). */
export const COLUNAS_SIGNING_KEYS = ['id', 'user_id', 'device_id', 'public_key_jwk', 'created_at', 'revoked_at'];

/** public.audit_logs */
export const COLUNAS_AUDIT_LOGS = ['id', 'actor_id', 'action', 'entity_type', 'entity_id', 'before', 'after', 'created_at'];
