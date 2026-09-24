-- Registo de quem viu as fotos da verificação simples do cidadão (Lei n.º 22/11,
-- Proteção de Dados Pessoais). A tabela identity_artifact_views já existia
-- para o KYC do staff (identity_verifications, função identity-kyc). Passa a
-- aceitar também vistas de fotos de cidadãos:
--   - verification_id deixa de ser obrigatório;
--   - citizen_user_id (novo) = o cidadão cujas fotos foram vistas;
--   - cada linha tem exatamente um dos dois.
-- As linhas do staff continuam válidas como estão.

alter table public.identity_artifact_views
  alter column verification_id drop not null,
  add column if not exists citizen_user_id uuid references auth.users (id);

alter table public.identity_artifact_views
  drop constraint if exists identity_artifact_views_um_alvo;
alter table public.identity_artifact_views
  add constraint identity_artifact_views_um_alvo
  check (num_nonnulls(verification_id, citizen_user_id) = 1);

create index if not exists identity_artifact_views_cidadao_idx
  on public.identity_artifact_views (citizen_user_id, viewed_at desc)
  where citizen_user_id is not null;
