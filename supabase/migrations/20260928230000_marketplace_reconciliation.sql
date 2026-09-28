-- Marketplace reconciliation core shared by all country payment/payout adapters.
create table if not exists public.marketplace_reconciliation (
 id uuid primary key default gen_random_uuid(), entity_type text not null check(entity_type in ('PAYMENT','PAYOUT')), entity_id uuid not null, country_code text not null references public.country_configs(country_code), currency text not null, expected_amount numeric(14,2) not null check(expected_amount>=0), observed_amount numeric(14,2), expected_reference text, observed_reference text, provider text, status text not null default 'PENDING' check(status in ('PENDING','MATCHED','MISMATCH','MISSING','DUPLICATE','MANUAL_REVIEW')), discrepancy_reason text, source_event_id uuid references public.marketplace_payment_events(id) on delete set null, checked_at timestamptz, resolved_at timestamptz, resolved_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(entity_type,entity_id)
);
alter table public.marketplace_reconciliation enable row level security;
revoke all on public.marketplace_reconciliation from anon,authenticated;
create index if not exists marketplace_reconciliation_status_idx on public.marketplace_reconciliation(status,country_code,created_at);
