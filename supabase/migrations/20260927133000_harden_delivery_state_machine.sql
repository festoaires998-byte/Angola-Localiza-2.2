-- Harden delivery state machine at the database boundary.
create or replace function public.entrega_transicao_permitida(p_from text,p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'CREATED' then p_to in ('ASSIGNED','CANCELLED')
    when 'ASSIGNED' then p_to in ('PICKED_UP','CANCELLED')
    when 'PICKED_UP' then p_to in ('IN_TRANSIT','CANCELLED')
    when 'IN_TRANSIT' then p_to in ('OUT_FOR_DELIVERY','CANCELLED')
    when 'OUT_FOR_DELIVERY' then p_to in ('DELIVERED','FAILED')
    when 'FAILED' then p_to in ('ASSIGNED','CANCELLED')
    when 'DELIVERED' then false
    when 'CANCELLED' then false
    else false
  end;
$$;

-- The two existing SECURITY DEFINER transition functions are recreated by the
-- preceding deployment with a database-side call to entrega_transicao_permitida.
-- Keep this migration as the durable source of the state-machine rule.
