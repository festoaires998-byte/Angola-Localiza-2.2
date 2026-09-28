-- Marketplace reconciliation core shared by all country payment/payout adapters.
create table if not exists public.marketplace_reconciliation (
 id uuid primary key default gen_random_uuid(), entity_type text not null check(entity_type in ('PAYMENT','PAYOUT')), entity_id uuid not null, country_code text not null references public.country_configs(country_code), currency text not null, expected_amount numeric(14,2) not null check(expected_amount>=0), observed_amount numeric(14,2), expected_reference text, observed_reference text, provider text, status text not null default 'PENDING' check(status in ('PENDING','MATCHED','MISMATCH','MISSING','DUPLICATE','MANUAL_REVIEW')), discrepancy_reason text, source_event_id uuid references public.marketplace_payment_events(id) on delete set null, checked_at timestamptz, resolved_at timestamptz, resolved_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(entity_type,entity_id)
);
alter table public.marketplace_reconciliation enable row level security;
revoke all on public.marketplace_reconciliation from anon,authenticated;
create index if not exists marketplace_reconciliation_status_idx on public.marketplace_reconciliation(status,country_code,created_at);

create or replace function public.marketplace_reconcile_payment(p_payment_id uuid)
returns public.marketplace_reconciliation language plpgsql security definer set search_path=public as $$
declare p public.marketplace_payment_intents; e public.marketplace_payment_events; r public.marketplace_reconciliation; st text; reason text;
begin
 select * into p from public.marketplace_payment_intents where id=p_payment_id;
 if p.id is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
 select * into e from public.marketplace_payment_events where payment_intent_id=p.id and signature_valid=true order by created_at desc limit 1;
 if e.id is null then st:='MISSING'; reason:='NO_VALID_PROVIDER_EVENT';
 elsif e.amount is distinct from p.amount_total or e.currency is distinct from p.currency then st:='MISMATCH'; reason:='AMOUNT_OR_CURRENCY_MISMATCH';
 elsif e.external_event_id is null then st:='MISMATCH'; reason:='MISSING_EXTERNAL_EVENT_ID';
 else st:='MATCHED'; end if;
 insert into public.marketplace_reconciliation(entity_type,entity_id,country_code,currency,expected_amount,observed_amount,expected_reference,observed_reference,provider,status,discrepancy_reason,source_event_id,checked_at)
 values('PAYMENT',p.id,p.country_code,p.currency,p.amount_total,e.amount,p.external_reference_id,e.external_event_id,e.provider,st,reason,e.id,now())
 on conflict(entity_type,entity_id) do update set observed_amount=excluded.observed_amount,observed_reference=excluded.observed_reference,provider=excluded.provider,status=excluded.status,discrepancy_reason=excluded.discrepancy_reason,source_event_id=excluded.source_event_id,checked_at=now(),updated_at=now()
 returning * into r; return r;
end $$;
revoke all on function public.marketplace_reconcile_payment(uuid) from public,anon,authenticated;

create or replace function public.marketplace_reconcile_payout(p_payout_id uuid)
returns public.marketplace_reconciliation language plpgsql security definer set search_path=public as $$
declare p public.marketplace_payouts; r public.marketplace_reconciliation; st text; reason text;
begin
 select * into p from public.marketplace_payouts where id=p_payout_id;
 if p.id is null then raise exception 'PAYOUT_NOT_FOUND'; end if;
 if p.status='PAID' and p.external_reference_id is not null then st:='MATCHED';
 elsif p.status='FAILED' then st:='MISMATCH'; reason:=coalesce(p.failure_reason,'PROVIDER_FAILED');
 elsif p.status in ('REQUESTED','PROCESSING') then st:='PENDING'; reason:='AWAITING_PROVIDER_CONFIRMATION';
 else st:='MANUAL_REVIEW'; reason:='PAYOUT_CANCELLED'; end if;
 insert into public.marketplace_reconciliation(entity_type,entity_id,country_code,currency,expected_amount,observed_amount,expected_reference,observed_reference,provider,status,discrepancy_reason,checked_at)
 values('PAYOUT',p.id,p.country_code,p.currency,p.amount,null,null,p.external_reference_id,p.external_provider,st,reason,now())
 on conflict(entity_type,entity_id) do update set observed_reference=excluded.observed_reference,provider=excluded.provider,status=excluded.status,discrepancy_reason=excluded.discrepancy_reason,checked_at=now(),updated_at=now()
 returning * into r; return r;
end $$;
revoke all on function public.marketplace_reconcile_payout(uuid) from public,anon,authenticated;
