-- Fotos da verificação simples (BI frente, BI verso e selfie) apagadas 90 dias
-- depois da decisão (aprovar ou recusar). Decidido pelo dono a 01/10/2026.
--
-- O Supabase não deixa apagar ficheiros do Storage por SQL (protect_delete):
-- quem apaga é a Edge Function limpeza-kyc, chamada uma vez por dia pelo
-- pg_cron. A função só aceita o pedido com o token guardado no Vault.

-- 1) Quando as fotos foram apagadas (o registo da decisão fica).
alter table public.user_identity
  add column if not exists citizen_id_artifacts_purged_at timestamptz;

comment on column public.user_identity.citizen_id_artifacts_purged_at is
  'Quando as fotos da verificação simples foram apagadas do bucket kyc-artifacts (90 dias depois da decisão).';

-- 2) Token aleatório só no Vault (nunca no código nem no repositório).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'limpeza_kyc_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'limpeza_kyc_token',
      'Token do pedido diário do pg_cron à Edge Function limpeza-kyc'
    );
  end if;
end;
$$;

-- 3) A função confirma o token sem o ler (só o servidor pode chamar isto).
create or replace function public.token_limpeza_kyc_valido(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_token) >= 32
      and p_token = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'limpeza_kyc_token'),
    false
  );
$$;

revoke all on function public.token_limpeza_kyc_valido(text) from public, anon, authenticated;
grant execute on function public.token_limpeza_kyc_valido(text) to service_role;

-- 4) Pedido diário às 03:15 (UTC) à função limpeza-kyc.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'limpeza-fotos-kyc',
  '15 3 * * *',
  $cron$
    select net.http_post(
      url := 'https://qntbknegicaghnbnghyw.supabase.co/functions/v1/limpeza-kyc',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-limpeza-token', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'limpeza_kyc_token')
      ),
      body := '{}'::jsonb
    );
  $cron$
);
