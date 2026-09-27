create or replace function public.atualizar_delivery_tracking(
  p_delivery_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_assigned uuid;
  v_current timestamptz;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180
     or (p_latitude = 0 and p_longitude = 0) then
    raise exception 'INVALID_COORDINATES';
  end if;
  if p_accuracy_meters is not null and (p_accuracy_meters < 0 or p_accuracy_meters > 10000) then
    raise exception 'INVALID_ACCURACY';
  end if;

  select assigned_driver,status into v_assigned,v_status
  from public.deliveries where id=p_delivery_id;

  if v_assigned is distinct from v_uid then raise exception 'NOT_ASSIGNED_DRIVER'; end if;
  if v_status not in ('PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY') then return false; end if;

  select updated_at into v_current from public.delivery_tracking where delivery_id=p_delivery_id;
  if v_current is not null and p_updated_at <= v_current then return false; end if;

  insert into public.delivery_tracking(delivery_id,latitude,longitude,accuracy_meters,updated_by,updated_at)
  values(p_delivery_id,p_latitude,p_longitude,p_accuracy_meters,v_uid,p_updated_at)
  on conflict(delivery_id) do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    accuracy_meters=excluded.accuracy_meters,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at
  where public.delivery_tracking.updated_at < excluded.updated_at;

  return true;
end;
$$;
revoke all on function public.atualizar_delivery_tracking(uuid,double precision,double precision,double precision,timestamptz) from public,anon,authenticated;
grant execute on function public.atualizar_delivery_tracking(uuid,double precision,double precision,double precision,timestamptz) to authenticated;