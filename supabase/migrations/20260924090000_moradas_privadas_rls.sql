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
