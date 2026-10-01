-- Apagar a conta (exigido pela Google Play e pela App Store). Decidido pelo
-- dono a 01/10/2026: apagar e anonimizar.
--
-- Esta função limpa os dados pessoais na base de dados; a Edge Function
-- apagar-conta apaga os ficheiros (kyc-artifacts/<id>/, chat-media/<id>/) e
-- depois faz a eliminação suave da conta (auth): a pessoa não volta a entrar,
-- o email e o telefone ficam baralhados e o id passa a ser anónimo.
--
-- Fica (sem nome nem contacto): entregas e provas (reclamações e contas),
-- moradas públicas validadas, levantamentos de campo, histórico de auditoria.

create or replace function public.apagar_dados_da_conta(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moradas_apagadas int := 0;
  v_morada uuid;
begin
  if p_user is null then
    raise exception 'APAGAR_CONTA: utilizador em falta';
  end if;

  delete from public.favorites where user_id = p_user;
  delete from public.search_history where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.sync_operations where user_id = p_user;
  delete from public.geocode_rate_limits where user_id = p_user;
  delete from public.app_errors where user_id = p_user;
  delete from public.organization_members where user_id = p_user;
  delete from public.driver_applications where user_id = p_user;
  delete from public.driver_profiles where user_id = p_user;
  delete from public.user_country_profiles where user_id = p_user;

  -- A chave do telemóvel deixa de valer para provas novas (as antigas guardam a verificação).
  update public.signing_keys set revoked_at = now() where user_id = p_user and revoked_at is null;

  -- Verificação de identidade: fica a decisão, sai o resto (os ficheiros são
  -- apagados pela Edge Function). Sem o hash, o mesmo BI pode criar outra conta.
  update public.user_identity
     set phone = null,
         phone_verified = false,
         citizen_id_photo_front_url = null,
         citizen_id_photo_back_url = null,
         citizen_selfie_url = null,
         citizen_id_artifacts_purged_at = coalesce(citizen_id_artifacts_purged_at, now())
   where user_id = p_user;
  update public.identity_verifications
     set id_hash = null, id_photo_url = null, id_photo_back_url = null, video_url = null
   where user_id = p_user;

  -- Moradas privadas da pessoa: apagadas se nada as usar (entregas, versões, ...).
  for v_morada in
    select a.id from public.addresses a where a.created_by = p_user and a.visibility_level = 'PRIVATE'
  loop
    begin
      delete from public.addresses where id = v_morada;
      v_moradas_apagadas := v_moradas_apagadas + 1;
    exception when foreign_key_violation then
      -- Usada por uma entrega: fica (só o pessoal autorizado a vê), sem a referência.
      update public.addresses set reference = null where id = v_morada;
    end;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (p_user, 'account_deleted', 'user', p_user, null, jsonb_build_object('moradas_privadas_apagadas', v_moradas_apagadas));

  return jsonb_build_object('moradas_privadas_apagadas', v_moradas_apagadas);
end;
$$;

revoke all on function public.apagar_dados_da_conta(uuid) from public, anon, authenticated;
grant execute on function public.apagar_dados_da_conta(uuid) to service_role;
