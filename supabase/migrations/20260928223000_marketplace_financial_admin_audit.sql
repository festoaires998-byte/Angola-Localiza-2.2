-- Financial KYC/payout administrative workflow and immutable audit trail.
create table if not exists public.marketplace_financial_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid, entity_type text not null check(entity_type in ('KYC','PAYOUT_ACCOUNT','PAYOUT','LEDGER')), entity_id uuid not null, action text not null, from_status text, to_status text, reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.marketplace_financial_audit enable row level security;
revoke all on public.marketplace_financial_audit from anon,authenticated;
create index if not exists marketplace_financial_audit_entity_idx on public.marketplace_financial_audit(entity_type,entity_id,created_at desc);

-- Administrative state transitions are intentionally security-definer and admin-only.
-- The canonical functions are installed by the Supabase migration pipeline.
