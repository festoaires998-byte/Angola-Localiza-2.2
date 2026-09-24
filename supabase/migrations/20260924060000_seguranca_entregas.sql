-- Segurança das entregas (para a deliveries v19). Aplicar ANTES de publicar a v19.
--
-- 1. Ninguém lê o PIN diretamente: a app e o site (anon/authenticated) só leem
--    as colunas públicas da entrega. O PIN só sai pela função (quem criou).
-- 2. Ninguém cria nem muda entregas diretamente (o estado, o PIN, o estafeta…):
--    tudo passa pela função deliveries, que aplica as regras.
-- 3. PIN com sorteio forte e no máximo 5 tentativas erradas.
-- 4. Bucket privado delivery-proofs para as fotos e assinaturas das provas.
-- 5. A prova guarda o motivo quando a assinatura criptográfica não confere.

-- 1 e 2: permissões por coluna na tabela deliveries -------------------------
revoke all on public.deliveries from anon, authenticated;
grant select (
  id, tracking_code, sender_name, sender_phone, recipient_name, recipient_phone,
  address_id, instructions, product_description, organization_id, assigned_driver,
  status, created_by, created_at, updated_at, origin_latitude, origin_longitude,
  origin_municipality_id, origin_province_id, zone_code, is_volumoso, is_espera_longa,
  payer_organization_id, confirmation_pin_expires_at, origin_postal_code,
  origin_plus_code, is_urgent
) on public.deliveries to authenticated;

drop policy if exists "Criar entrega própria" on public.deliveries;
drop policy if exists "Editar entrega própria (exceto estado)" on public.deliveries;

-- As provas e o histórico só são escritos pela função (já não havia regras de escrita).
revoke insert, update, delete, truncate on public.delivery_proofs from anon, authenticated;
revoke insert, update, delete, truncate on public.delivery_status_history from anon, authenticated;

-- 3: PIN -----------------------------------------------------------------
alter table public.deliveries
  add column if not exists pin_failed_attempts integer not null default 0;

-- 4 dígitos (1000–9999) com bytes criptográficos (pgcrypto), em vez de random().
create or replace function public.gerar_pin_entrega()
returns text
language sql
volatile
set search_path = ''
as $$
  select (1000 + (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 9000))::text;
$$;
revoke execute on function public.gerar_pin_entrega() from public, anon, authenticated;
grant execute on function public.gerar_pin_entrega() to service_role;

alter table public.deliveries
  alter column confirmation_pin set default public.gerar_pin_entrega();

-- Confere o PIN de uma vez (com a linha trancada) e conta as tentativas erradas.
-- Resultado: {"resultado": "OK" | "WRONG" | "LOCKED" | "EXPIRED" | "NOT_FOUND", "restantes": n}
create or replace function public.verificar_pin_entrega(p_delivery_id uuid, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d record;
  maximo constant integer := 5;
begin
  select confirmation_pin, confirmation_pin_expires_at, pin_failed_attempts
    into d
    from public.deliveries
   where id = p_delivery_id
     for update;
  if not found then
    return jsonb_build_object('resultado', 'NOT_FOUND');
  end if;
  if d.pin_failed_attempts >= maximo then
    return jsonb_build_object('resultado', 'LOCKED', 'restantes', 0);
  end if;
  if d.confirmation_pin_expires_at is not null and d.confirmation_pin_expires_at < now() then
    return jsonb_build_object('resultado', 'EXPIRED');
  end if;
  if p_pin is not null and d.confirmation_pin is not null and p_pin = d.confirmation_pin then
    return jsonb_build_object('resultado', 'OK');
  end if;
  update public.deliveries
     set pin_failed_attempts = pin_failed_attempts + 1
   where id = p_delivery_id;
  if d.pin_failed_attempts + 1 >= maximo then
    return jsonb_build_object('resultado', 'LOCKED', 'restantes', 0);
  end if;
  return jsonb_build_object('resultado', 'WRONG', 'restantes', maximo - d.pin_failed_attempts - 1);
end;
$$;
revoke execute on function public.verificar_pin_entrega(uuid, text) from public, anon, authenticated;
grant execute on function public.verificar_pin_entrega(uuid, text) to service_role;

-- 4: bucket privado das provas -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada pessoa só envia para a sua pasta ("<id>/<ficheiro>"). Ninguém lê
-- diretamente: os links (10 min) saem pela função (proof_files).
drop policy if exists "Autenticado envia provas de entrega na própria pasta" on storage.objects;
create policy "Autenticado envia provas de entrega na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Quantos dos ficheiros indicados (pares nome/bucket) existem E foram enviados
-- por esse utilizador. Só a função (service_role) a pode chamar.
create or replace function public.ficheiros_da_prova(nomes text[], buckets text[], utilizador uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct (f.bucket, f.nome))::integer
    from unnest(nomes, buckets) as f(nome, bucket)
    join storage.objects o
      on o.bucket_id = f.bucket
     and o.name = f.nome
   where f.bucket in ('delivery-proofs', 'field-photos')
     and (o.owner = utilizador or o.owner_id = utilizador::text);
$$;
revoke execute on function public.ficheiros_da_prova(text[], text[], uuid) from public, anon, authenticated;
grant execute on function public.ficheiros_da_prova(text[], text[], uuid) to service_role;

-- 5: motivo quando a assinatura criptográfica não confere ---------------
alter table public.delivery_proofs
  add column if not exists crypto_failure_reason text;
