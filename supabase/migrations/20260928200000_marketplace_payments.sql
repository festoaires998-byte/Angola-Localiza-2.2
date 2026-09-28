-- Marketplace payments: ledger, idempotency and provider events.
create table if not exists public.marketplace_payment_intents (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.marketplace_service_bookings(id) on delete restrict,
 client_id uuid not null references auth.users(id) on delete restrict,
 provider_id uuid not null references public.marketplace_service_profiles(id) on delete restrict,
 country_code text not null references public.country_configs(country_code),
 currency text not null,
 amount_total numeric(14,2) not null check(amount_total>0),
 platform_fee numeric(14,2) not null default 0 check(platform_fee>=0 and platform_fee<=amount_total),
 provider_amount numeric(14,2) generated always as (amount_total-platform_fee) stored,
 fee_rate numeric(7,4) not null default 0 check(fee_rate>=0 and fee_rate<=1),
 payment_method text not null check(payment_method in ('PROXYPAY_MULTICAIXA','PROXYPAY_GPO','KWIK','BANK_TRANSFER','OTHER')),
 status text not null default 'PENDING' check(status in ('PENDING','REQUIRES_ACTION','PROCESSING','PAID','FAILED','EXPIRED','REFUNDED','CANCELLED')),
 external_provider text,
 external_reference_id text,
 external_reference_number text,
 idempotency_key text not null,
 metadata jsonb not null default '{}'::jsonb,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(client_id,idempotency_key)
);
alter table public.marketplace_payment_intents enable row level security;
drop policy if exists "marketplace payment participants read" on public.marketplace_payment_intents;
create policy "marketplace payment participants read" on public.marketplace_payment_intents for select to authenticated using(
 client_id=(select auth.uid())
 or exists(select 1 from public.marketplace_service_profiles p where p.id=provider_id and p.owner_id=(select auth.uid()))
 or public.is_admin((select auth.uid()))
);
revoke insert,update,delete on public.marketplace_payment_intents from anon,authenticated;
create index if not exists marketplace_payment_intents_status_idx on public.marketplace_payment_intents(status,country_code);
create index if not exists marketplace_payment_intents_provider_idx on public.marketplace_payment_intents(provider_id,status);

create table if not exists public.marketplace_payment_events (
 id uuid primary key default gen_random_uuid(),
 payment_intent_id uuid references public.marketplace_payment_intents(id) on delete set null,
 provider text not null,
 external_event_id text not null,
 event_type text not null,
 amount numeric(14,2),
 currency text,
 raw_payload jsonb not null default '{}'::jsonb,
 signature_valid boolean not null default false,
 processed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(provider,external_event_id)
);
alter table public.marketplace_payment_events enable row level security;
revoke all on public.marketplace_payment_events from anon,authenticated;
create index if not exists marketplace_payment_events_intent_idx on public.marketplace_payment_events(payment_intent_id);
