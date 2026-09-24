-- Pesquisa sem ligar a acentos nem a maiúsculas: "missao" encontra "Missão".
--
-- A Edge Function "pesquisa" (service role) chama estas funções. Recebem o
-- padrão do ilike já preparado pela função (os % e _ escritos pela pessoa
-- vêm escapados) e comparam os dois lados sem acentos.
-- Só a service role as pode chamar: a app e o site usam a "pesquisa", que
-- decide o que cada pessoa pode ver (privacidade).

create extension if not exists unaccent with schema extensions;

-- unaccent com o dicionário explícito é estável; o wrapper é marcado imutável
-- para poder ser usado em índices mais tarde.
create or replace function public.sem_acentos(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, ''))
$$;

create or replace function public.pesquisa_ruas(p_padrao text, p_limite integer)
returns table (id uuid, name text, neighborhood_id uuid, origin_lat double precision, origin_lng double precision)
language sql
stable
set search_path = ''
as $$
  select s.id, s.name, s.neighborhood_id, s.origin_lat, s.origin_lng
    from public.streets s
   where public.sem_acentos(s.name) ilike public.sem_acentos(p_padrao)
   order by s.name
   limit least(greatest(coalesce(p_limite, 8), 1), 50)
$$;

create or replace function public.pesquisa_bairros(p_padrao text, p_limite integer)
returns table (id uuid, name text)
language sql
stable
set search_path = ''
as $$
  select n.id, n.name
    from public.neighborhoods n
   where public.sem_acentos(n.name) ilike public.sem_acentos(p_padrao)
   order by n.name
   limit least(greatest(coalesce(p_limite, 8), 1), 50)
$$;

-- Moradas (só nos estados pedidos) cuja referência bate certo. A privacidade
-- (moradas "Privadas") é decidida na Edge Function.
create or replace function public.pesquisa_moradas_por_referencia(p_padrao text, p_estados text[], p_limite integer)
returns table (
  id uuid, postal_code text, plus_code text, house_number text, reference text, status text,
  visibility_level text, created_by uuid, latitude double precision, longitude double precision,
  street_id uuid, neighborhood_id uuid
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.postal_code, a.plus_code, a.house_number, a.reference, a.status,
         a.visibility_level, a.created_by, a.latitude, a.longitude, a.street_id, a.neighborhood_id
    from public.addresses a
   where a.status = any (p_estados)
     and public.sem_acentos(a.reference) ilike public.sem_acentos(p_padrao)
   order by a.created_at desc
   limit least(greatest(coalesce(p_limite, 24), 1), 100)
$$;

revoke all on function public.sem_acentos(text) from public, anon, authenticated;
revoke all on function public.pesquisa_ruas(text, integer) from public, anon, authenticated;
revoke all on function public.pesquisa_bairros(text, integer) from public, anon, authenticated;
revoke all on function public.pesquisa_moradas_por_referencia(text, text[], integer) from public, anon, authenticated;
grant execute on function public.sem_acentos(text) to service_role;
grant execute on function public.pesquisa_ruas(text, integer) to service_role;
grant execute on function public.pesquisa_bairros(text, integer) to service_role;
grant execute on function public.pesquisa_moradas_por_referencia(text, text[], integer) to service_role;
