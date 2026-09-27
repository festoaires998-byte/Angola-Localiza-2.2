-- Atomic delivery transition + proof persistence.
create or replace function public.aplicar_transicao_entrega_com_prova(
  p_delivery_id uuid,
  p_expected_status text,
  p_new_status text,
  p_proof jsonb default null,
  p_sync_operation_id uuid default null
)
returns table (applied boolean, proof_id uuid, final_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_existing public.delivery_proofs%rowtype;
  v_proof_id uuid;
begin
  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;

  if p_sync_operation_id is not null then
    select * into v_existing
    from public.delivery_proofs
    where sync_operation_id = p_sync_operation_id
    limit 1;

    if found then
      return query select false, v_existing.id, v_delivery.status;
      return;
    end if;
  end if;

  if v_delivery.status <> p_expected_status then
    raise exception 'DELIVERY_STATE_CHANGED';
  end if;

  update public.deliveries
  set status = p_new_status, updated_at = now()
  where id = p_delivery_id;

  insert into public.delivery_status_history(delivery_id, status)
  values (p_delivery_id, p_new_status);

  if p_proof is not null then
    insert into public.delivery_proofs(
      delivery_id, proof_type, observation, photo_url, signature_url,
      created_by, sync_operation_id, crypto_signature, crypto_payload,
      crypto_algorithm, crypto_device_id, crypto_verified,
      crypto_failure_reason, location
    )
    values (
      p_delivery_id,
      p_proof->>'proof_type',
      p_proof->>'observation',
      p_proof->>'photo_url',
      p_proof->>'signature_url',
      (p_proof->>'created_by')::uuid,
      p_sync_operation_id,
      p_proof->>'crypto_signature',
      p_proof->>'crypto_payload',
      p_proof->>'crypto_algorithm',
      p_proof->>'crypto_device_id',
      case when p_proof ? 'crypto_verified' then (p_proof->>'crypto_verified')::boolean else null end,
      p_proof->>'crypto_failure_reason',
      case when p_proof->>'location_wkt' is not null
        then public.st_geogfromtext(p_proof->>'location_wkt')
        else null end
    )
    returning id into v_proof_id;
  end if;

  return query select true, v_proof_id, p_new_status;
end;
$$;

revoke all on function public.aplicar_transicao_entrega_com_prova(uuid,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.aplicar_transicao_entrega_com_prova(uuid,text,text,jsonb,uuid) to service_role;