-- Mudar o país da conta (Definições → "País da conta"). Decidido pelo dono a
-- 02/10/2026: a escolha nas Definições passa a ficar gravada na conta, como a
-- do registo (antes só mudava o telemóvel e voltava atrás ao abrir a app).
--
-- Só o cidadão muda o seu país sozinho. O pessoal com cargo e os motoristas
-- não: o país da conta decide o que um admin nacional pode gerir e o país da
-- candidatura de motorista; para esses, um administrador trata do pedido.
-- A política de UPDATE da tabela continua a não deixar mudar o país direto.

create or replace function public.mudar_pais_da_conta(p_pais text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_codigo text := upper(trim(coalesce(p_pais, '')));
  v_antes text;
begin
  if v_user is null then
    raise exception 'MUDAR_PAIS_SEM_SESSAO: inicia sessao novamente';
  end if;
  if not exists (select 1 from public.country_configs c where c.country_code = v_codigo and c.enabled) then
    raise exception 'MUDAR_PAIS_INVALIDO: pais nao suportado';
  end if;
  if exists (select 1 from public.organization_members m where m.user_id = v_user) then
    raise exception 'MUDAR_PAIS_PESSOAL: o pessoal com cargo pede a um administrador para mudar de pais';
  end if;
  if exists (select 1 from public.driver_profiles d where d.user_id = v_user)
     or exists (select 1 from public.driver_applications a where a.user_id = v_user and a.status <> 'REJECTED') then
    raise exception 'MUDAR_PAIS_MOTORISTA: os motoristas pedem a um administrador para mudar de pais';
  end if;

  select p.country_code into v_antes from public.user_country_profiles p where p.user_id = v_user for update;
  if v_antes = v_codigo then
    return v_codigo;
  end if;

  insert into public.user_country_profiles (user_id, country_code)
  values (v_user, v_codigo)
  on conflict (user_id) do update set country_code = excluded.country_code, updated_at = now();

  -- A app e o site leem o país da conta em user_metadata.country_code.
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('country_code', v_codigo)
   where id = v_user;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (v_user, 'account_country_changed', 'user', v_user,
          jsonb_build_object('country_code', v_antes), jsonb_build_object('country_code', v_codigo));

  return v_codigo;
end;
$$;

revoke all on function public.mudar_pais_da_conta(text) from public, anon;
grant execute on function public.mudar_pais_da_conta(text) to authenticated;
