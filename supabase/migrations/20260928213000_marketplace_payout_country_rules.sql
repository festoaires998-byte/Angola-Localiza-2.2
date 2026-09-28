-- Marketplace multi-country payout configuration and verified destination accounts.
create table if not exists public.marketplace_payout_country_rules (
 country_code text primary key references public.country_configs(country_code),
 bank_account_enabled boolean not null default true,
 mobile_money_enabled boolean not null default false,
 minimum_payout numeric(14,2) not null default 1 check(minimum_payout>0),
 maximum_payout numeric(14,2) check(maximum_payout is null or maximum_payout>=minimum_payout),
 kyc_required boolean not null default true,
 provider_key text,
 updated_at timestamptz not null default now()
);
insert into public.marketplace_payout_country_rules(country_code,bank_account_enabled,mobile_money_enabled,minimum_payout,kyc_required)
values ('AO',true,false,1000,true),('MZ',true,false,100,true),('CV',true,false,10,true),('GW',true,false,1000,true),('ST',true,false,10,true)
on conflict(country_code) do update set updated_at=now();
alter table public.marketplace_payout_country_rules enable row level security;
revoke all on public.marketplace_payout_country_rules from anon,authenticated;

create table if not exists public.marketplace_payout_accounts (
 id uuid primary key default gen_random_uuid(),
 provider_id uuid not null references public.marketplace_service_profiles(id) on delete restrict,
 country_code text not null references public.country_configs(country_code),
 currency text not null,
 destination_type text not null check(destination_type in ('BANK_ACCOUNT','MOBILE_MONEY')),
 holder_name text not null,
 masked_destination text not null,
 provider_token text,
 kyc_status text not null default 'PENDING' check(kyc_status in ('PENDING','VERIFIED','REJECTED')),
 status text not null default 'PENDING' check(status in ('PENDING','ACTIVE','DISABLED')),
 is_default boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider_id,masked_destination)
);
alter table public.marketplace_payout_accounts enable row level security;
create policy "provider payout accounts read own" on public.marketplace_payout_accounts for select to authenticated using(exists(select 1 from public.marketplace_service_profiles p where p.id=provider_id and p.owner_id=(select auth.uid())) or public.is_admin((select auth.uid())));
revoke insert,update,delete on public.marketplace_payout_accounts from anon,authenticated;
create index if not exists marketplace_payout_accounts_provider_idx on public.marketplace_payout_accounts(provider_id,status,is_default);
