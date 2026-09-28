-- Financial KYC reuses the existing identity verification; no duplicate document storage.
create table if not exists public.marketplace_provider_kyc (
 id uuid primary key default gen_random_uuid(),
 provider_id uuid not null unique references public.marketplace_service_profiles(id) on delete restrict,
 user_id uuid not null unique,
 country_code text not null references public.country_configs(country_code),
 status text not null default 'PENDING' check(status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED','SUSPENDED')),
 identity_status text,
 identity_verification_id uuid references public.identity_verifications(id) on delete set null,
 rejection_reason text,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.marketplace_provider_kyc enable row level security;
create policy "provider kyc read own" on public.marketplace_provider_kyc for select to authenticated using(user_id=(select auth.uid()) or public.is_admin((select auth.uid())));
revoke insert,update,delete on public.marketplace_provider_kyc from anon,authenticated;
create index if not exists marketplace_provider_kyc_country_status_idx on public.marketplace_provider_kyc(country_code,status);

create or replace function public.marketplace_sync_provider_kyc(p_provider_id uuid)
returns public.marketplace_provider_kyc
language plpgsql security definer set search_path=public
as $$
declare p public.marketplace_service_profiles; i public.user_identity; v public.marketplace_provider_kyc;
begin
 select * into p from public.marketplace_service_profiles where id=p_provider_id;
 if p.id is null then raise exception 'PROVIDER_NOT_FOUND'; end if;
 select * into i from public.user_identity where user_id=p.owner_id;
 insert into public.marketplace_provider_kyc(provider_id,user_id,country_code,status,identity_status)
 values(p.id,p.owner_id,p.country_code,
   case when coalesce(i.citizen_id_verified,false) and coalesce(i.citizen_id_status,'')='VERIFIED' then 'VERIFIED' else 'PENDING' end,
   i.citizen_id_status)
 on conflict(provider_id) do update set
   country_code=excluded.country_code,
   identity_status=excluded.identity_status,
   status=case when excluded.status='VERIFIED' and marketplace_provider_kyc.status not in ('SUSPENDED','REJECTED') then 'VERIFIED'
               when marketplace_provider_kyc.status='VERIFIED' and excluded.status='PENDING' then 'PENDING'
               else marketplace_provider_kyc.status end,
   updated_at=now();
 select * into v from public.marketplace_provider_kyc where provider_id=p.id; return v;
end $$;
revoke all on function public.marketplace_sync_provider_kyc(uuid) from public,anon,authenticated;
