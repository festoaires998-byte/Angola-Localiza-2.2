-- Verificação simples do cidadão: deixa de ser aprovada automaticamente.
-- O envio (citizen-verify?action=submit) passa a pôr a verificação "Por rever"
-- (PENDING_REVIEW); só um administrador a aprova (VERIFIED) ou recusa (REJECTED).
-- A coluna citizen_id_verified continua a ser a que a field-service consulta:
-- só fica true quando um administrador aprova.

alter table public.user_identity
  add column if not exists citizen_id_status text,
  add column if not exists citizen_id_reviewed_by uuid references auth.users (id),
  add column if not exists citizen_id_reviewed_at timestamptz,
  add column if not exists citizen_id_rejection_reason text;

alter table public.user_identity
  drop constraint if exists user_identity_citizen_id_status_check;
alter table public.user_identity
  add constraint user_identity_citizen_id_status_check
  check (citizen_id_status is null or citizen_id_status in ('PENDING_REVIEW', 'VERIFIED', 'REJECTED'));

-- Quem já estava verificado continua verificado (hoje: ninguém).
update public.user_identity
   set citizen_id_status = 'VERIFIED'
 where citizen_id_verified = true and citizen_id_status is null;

-- Quantas das fotos indicadas existem no bucket privado kyc-artifacts E foram
-- enviadas por esse utilizador (dono do objeto no Storage). Só a Edge Function
-- (service_role) a pode chamar.
create or replace function public.kyc_artefactos_do_utilizador(nomes text[], utilizador uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct o.name)::integer
    from storage.objects o
   where o.bucket_id = 'kyc-artifacts'
     and o.name = any (nomes)
     and (o.owner = utilizador or o.owner_id = utilizador::text);
$$;

revoke all on function public.kyc_artefactos_do_utilizador(text[], uuid) from public, anon, authenticated;
grant execute on function public.kyc_artefactos_do_utilizador(text[], uuid) to service_role;
