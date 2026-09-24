-- Testes de acesso das migrações 20260924090000_moradas_privadas_rls e
-- 20260924090100_moradas_ligadas_fora_da_api.
-- Correr no SQL do Supabase: aplica a migração, cria dados de teste, entra como
-- cada pessoa, regista o que ela consegue ler e DESFAZ TUDO no fim (rollback).
begin;

-- Moradas privadas: blindar a leitura direta da tabela addresses (PostgREST).
--
-- Antes: qualquer pessoa (até sem sessão, com a chave pública) lia todas as
-- moradas aprovadas, incluindo as "Privadas" (coordenadas e referência).
--
-- Agora uma morada só se lê se:
--   1. está aprovada/oficial/publicada E não é "Privada"; OU
--   2. quem pede é quem a criou (inclui o cidadão que a registou: na
--      aprovação, a field-service grava created_by = quem registou); OU
--   3. está nos favoritos de quem pede; OU
--   4. é o destino de uma entrega ATIVA (nem DELIVERED nem CANCELLED) que
--      quem pede criou ou tem atribuída como estafeta; OU
--   5. quem pede é administrador (validação), como antes.
--
-- As condições 3 e 4 usam a função SECURITY DEFINER moradas_ligadas_a_mim():
--   - devolve, de uma só vez, os ids das moradas nos favoritos de quem pede e
--     das suas entregas ativas; a regra só pergunta "id in (...)", e o
--     PostgreSQL calcula a lista UMA vez por consulta (hashed SubPlan), em vez
--     de uma verificação por morada (medido: 2004 moradas, 74 ms → 3 ms);
--   - quem não tem sessão (anon) não tem acesso à tabela deliveries: uma
--     consulta direta na regra dava "permission denied" em vez de "não";
--   - não aplica as regras de favorites/deliveries a cada linha e não há
--     ciclos entre regras;
--   - usa os índices que já existem (favorites(user_id, …), deliveries
--     (created_by) e (assigned_driver)).
-- is_admin também fica dentro de (select …), para ser calculado uma só vez.
--
-- Para que as condições 3 e 4 não sirvam de porta de entrada:
--   - só se põe nos favoritos uma morada que já se pode ler (regra restritiva
--     abaixo, para inserir e para mudar);
--   - a Edge Function deliveries (v20) só aceita como destino uma morada que
--     quem cria a entrega já pode ler.

-- Moradas nos favoritos de quem pede e destinos das suas entregas ativas
-- (criadas por si ou atribuídas a si). Vazio sem sessão.
create or replace function public.moradas_ligadas_a_mim()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.address_id
    from public.favorites f
   where f.user_id = (select auth.uid())
  union
  select d.address_id
    from public.deliveries d
   where (d.created_by = (select auth.uid()) or d.assigned_driver = (select auth.uid()))
     and d.status not in ('DELIVERED', 'CANCELLED')
     and d.address_id is not null
$$;
revoke all on function public.moradas_ligadas_a_mim() from public;
grant execute on function public.moradas_ligadas_a_mim() to anon, authenticated, service_role;

drop policy if exists "Ler moradas publicadas ou próprias" on public.addresses;
drop policy if exists "Ler moradas visíveis" on public.addresses;
create policy "Ler moradas visíveis"
  on public.addresses
  for select
  using (
    (
      status in ('APPROVED', 'OFFICIAL', 'PUBLISHED')
      and visibility_level is distinct from 'PRIVATE'
    )
    or created_by = (select auth.uid())
    or id in (select public.moradas_ligadas_a_mim())
    or (select public.is_admin((select auth.uid())))
  );

-- Favoritos: só de moradas que a pessoa já pode ler (a leitura acima decide).
-- Regra restritiva: soma-se (E) à regra "Gerir os próprios favoritos".
drop policy if exists "Favorito só de morada visível (criar)" on public.favorites;
create policy "Favorito só de morada visível (criar)"
  on public.favorites
  as restrictive
  for insert
  with check (exists (select 1 from public.addresses a where a.id = favorites.address_id));

drop policy if exists "Favorito só de morada visível (mudar)" on public.favorites;
create policy "Favorito só de morada visível (mudar)"
  on public.favorites
  as restrictive
  for update
  with check (exists (select 1 from public.addresses a where a.id = favorites.address_id));


-- A função moradas_ligadas_a_mim() (usada pela regra de leitura de addresses)
-- passa para o esquema "privado", que a API (PostgREST) não expõe: deixa de
-- se poder chamar por /rest/v1/rpc/moradas_ligadas_a_mim. Não havia fuga (só
-- devolve os ids ligados a quem pergunta), mas o aviso do Supabase fica
-- resolvido. A regra continua a funcionar: guarda a função pelo seu id interno.

create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to anon, authenticated, service_role;

-- (Só no teste: se as migrações já estiverem aplicadas, tira a versão antiga
-- do esquema privado; a regra já aponta para a nova. O rollback repõe tudo.)
drop function if exists privado.moradas_ligadas_a_mim();
alter function public.moradas_ligadas_a_mim() set schema privado;

create temp table resultados (caso text, esperado boolean, obtido boolean) on commit drop;
grant all on resultados to anon, authenticated;

-- Dados de teste (como dono da base de dados, sem regras).
insert into public.addresses (id, latitude, longitude, location, status, visibility_level, source, created_by) values
  ('00000000-0000-4000-8000-00000000a001', -12.77, 15.73, 'SRID=4326;POINT(15.73 -12.77)', 'APPROVED', 'PRIVATE', 'app', '16f26c79-2f57-4b6a-835f-e39fde525454'),
  ('00000000-0000-4000-8000-00000000a002', -12.78, 15.74, 'SRID=4326;POINT(15.74 -12.78)', 'APPROVED', 'PUBLIC',  'app', '16f26c79-2f57-4b6a-835f-e39fde525454'),
  ('00000000-0000-4000-8000-00000000a003', -12.79, 15.75, 'SRID=4326;POINT(15.75 -12.79)', 'PROPOSED', 'PUBLIC',  'app', '16f26c79-2f57-4b6a-835f-e39fde525454'),
  ('00000000-0000-4000-8000-00000000a004', -12.80, 15.76, 'SRID=4326;POINT(15.76 -12.80)', 'APPROVED', 'PRIVATE', 'app', '16f26c79-2f57-4b6a-835f-e39fde525454'),
  ('00000000-0000-4000-8000-00000000a005', -12.81, 15.77, 'SRID=4326;POINT(15.77 -12.81)', 'APPROVED', 'LIMITED', 'app', '16f26c79-2f57-4b6a-835f-e39fde525454');
-- a001 (privada): destino de uma entrega ATIVA do estafeta B.
-- a004 (privada): destino de uma entrega JÁ ENTREGUE do estafeta C.
insert into public.deliveries (id, tracking_code, address_id, recipient_name, status, created_by, assigned_driver) values
  ('00000000-0000-4000-8000-00000000d001', 'TESTE-RLS-1', '00000000-0000-4000-8000-00000000a001', 'Teste', 'ASSIGNED',  '16f26c79-2f57-4b6a-835f-e39fde525454', 'a9b09c02-476a-4952-956a-d2d48fd78ab8'),
  ('00000000-0000-4000-8000-00000000d002', 'TESTE-RLS-2', '00000000-0000-4000-8000-00000000a004', 'Teste', 'DELIVERED', '16f26c79-2f57-4b6a-835f-e39fde525454', 'bb261090-dc36-4c37-a5fc-252db1f4f243');

-- Cada caso: quem pede, a morada, e se deve conseguir ler.
create temp table casos (quem text, uid uuid, morada uuid, esperado boolean, caso text) on commit drop;
insert into casos values
  ('anónimo', null, '00000000-0000-4000-8000-00000000a001', false, 'anónimo NÃO lê morada privada aprovada'),
  ('anónimo', null, '00000000-0000-4000-8000-00000000a002', true,  'anónimo lê morada pública aprovada'),
  ('anónimo', null, '00000000-0000-4000-8000-00000000a005', true,  'anónimo lê morada limitada aprovada'),
  ('anónimo', null, '00000000-0000-4000-8000-00000000a003', false, 'anónimo NÃO lê morada por validar'),
  ('dono',    '16f26c79-2f57-4b6a-835f-e39fde525454', '00000000-0000-4000-8000-00000000a001', true,  'dono lê a sua morada privada'),
  ('dono',    '16f26c79-2f57-4b6a-835f-e39fde525454', '00000000-0000-4000-8000-00000000a003', true,  'dono lê a sua morada por validar'),
  ('estafeta B', 'a9b09c02-476a-4952-956a-d2d48fd78ab8', '00000000-0000-4000-8000-00000000a001', true,  'estafeta lê a privada da sua entrega ATIVA'),
  ('estafeta B', 'a9b09c02-476a-4952-956a-d2d48fd78ab8', '00000000-0000-4000-8000-00000000a004', false, 'estafeta NÃO lê privada de entrega de outro'),
  ('estafeta C', 'bb261090-dc36-4c37-a5fc-252db1f4f243', '00000000-0000-4000-8000-00000000a004', false, 'estafeta NÃO lê a privada de uma entrega já ENTREGUE'),
  ('estafeta C', 'bb261090-dc36-4c37-a5fc-252db1f4f243', '00000000-0000-4000-8000-00000000a001', false, 'pessoa de fora NÃO lê morada privada'),
  ('estafeta C', 'bb261090-dc36-4c37-a5fc-252db1f4f243', '00000000-0000-4000-8000-00000000a003', false, 'pessoa de fora NÃO lê morada por validar'),
  ('estafeta C', 'bb261090-dc36-4c37-a5fc-252db1f4f243', '00000000-0000-4000-8000-00000000a002', true,  'pessoa de fora lê morada pública'),
  ('admin',   'a655e00a-0e1b-47da-a62c-6a9e73349790', '00000000-0000-4000-8000-00000000a001', true,  'administrador lê morada privada (validação)'),
  ('admin',   'a655e00a-0e1b-47da-a62c-6a9e73349790', '00000000-0000-4000-8000-00000000a003', true,  'administrador lê morada por validar (validação)');

do $$
declare c record;
begin
  for c in select * from casos loop
    if c.uid is null then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
    else
      perform set_config('request.jwt.claims', json_build_object('sub', c.uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
    insert into resultados values (c.caso, c.esperado, exists (select 1 from public.addresses where id = c.morada));
    reset role;
  end loop;
end $$;

-- Favoritos: C tenta pôr nos favoritos a morada privada de A (tem de ser recusado);
-- C pode pôr a pública; o dono pode pôr a sua privada.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bb261090-dc36-4c37-a5fc-252db1f4f243', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.favorites (user_id, address_id) values ('bb261090-dc36-4c37-a5fc-252db1f4f243', '00000000-0000-4000-8000-00000000a001');
    insert into resultados values ('favorito de morada privada alheia é RECUSADO', true, false);
  exception when others then
    insert into resultados values ('favorito de morada privada alheia é RECUSADO', true, true);
  end;
  begin
    insert into public.favorites (user_id, address_id) values ('bb261090-dc36-4c37-a5fc-252db1f4f243', '00000000-0000-4000-8000-00000000a002');
    insert into resultados values ('favorito de morada pública é aceite', true, true);
  exception when others then
    insert into resultados values ('favorito de morada pública é aceite', true, false);
  end;
  -- Mudar um favorito para apontar para a privada alheia também é recusado.
  begin
    update public.favorites set address_id = '00000000-0000-4000-8000-00000000a001'
     where user_id = 'bb261090-dc36-4c37-a5fc-252db1f4f243' and address_id = '00000000-0000-4000-8000-00000000a002';
    insert into resultados values ('mudar favorito para morada privada alheia é RECUSADO', true, not found);
  exception when others then
    insert into resultados values ('mudar favorito para morada privada alheia é RECUSADO', true, true);
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', '16f26c79-2f57-4b6a-835f-e39fde525454', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.favorites (user_id, address_id) values ('16f26c79-2f57-4b6a-835f-e39fde525454', '00000000-0000-4000-8000-00000000a001');
    insert into resultados values ('dono põe a sua morada privada nos favoritos', true, true);
  exception when others then
    insert into resultados values ('dono põe a sua morada privada nos favoritos', true, false);
  end;
  reset role;
end $$;

-- Quem tem a morada nos favoritos lê-a (mesmo se o dono a tornar privada depois).
update public.addresses set visibility_level = 'PRIVATE' where id = '00000000-0000-4000-8000-00000000a002';
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bb261090-dc36-4c37-a5fc-252db1f4f243', 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into resultados values ('quem tem a morada nos favoritos continua a lê-la',
    true, exists (select 1 from public.addresses where id = '00000000-0000-4000-8000-00000000a002'));
  reset role;
end $$;

select caso, esperado, obtido, case when esperado = obtido then 'OK' else 'FALHOU' end as resultado from resultados;
rollback;
