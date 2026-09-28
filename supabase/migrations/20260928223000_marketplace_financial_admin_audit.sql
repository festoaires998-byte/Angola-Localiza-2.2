-- Financial KYC/payout administrative workflow and immutable audit trail.
create table if not exists public.marketplace_financial_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid, entity_type text not null check(entity_type in ('KYC','PAYOUT_ACCOUNT','PAYOUT','LEDGER')), entity_id uuid not null, action text not null, from_status text, to_status text, reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.marketplace_financial_audit enable row level security;
revoke all on public.marketplace_financial_audit from anon,authenticated;
create index if not exists marketplace_financial_audit_entity_idx on public.marketplace_financial_audit(entity_type,entity_id,created_at desc);

-- Administrative state transitions are intentionally security-definer and admin-only.
-- The canonical functions are installed by the Supabase migration pipeline.

create or replace function public.marketplace_admin_review_kyc(p_kyc_id uuid,p_status text,p_reason text default null)
returns public.marketplace_provider_kyc language plpgsql security definer set search_path=public as $$
declare k public.marketplace_provider_kyc; old text;
begin
 if not public.is_admin((select auth.uid())) then raise exception 'ADMIN_ONLY'; end if;
 if p_status not in ('IN_REVIEW','VERIFIED','REJECTED','SUSPENDED') then raise exception 'INVALID_KYC_STATUS'; end if;
 select * into k from public.marketplace_provider_kyc where id=p_kyc_id for update;
 if k.id is null then raise exception 'KYC_NOT_FOUND'; end if;
 if p_status='VERIFIED' and k.identity_status is distinct from 'VERIFIED' then raise exception 'IDENTITY_NOT_VERIFIED'; end if;
 if p_status='REJECTED' and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
 old:=k.status;
 update public.marketplace_provider_kyc set status=p_status,rejection_reason=case when p_status='REJECTED' then p_reason else null end,reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_kyc_id returning * into k;
 insert into public.marketplace_financial_audit(actor_id,entity_type,entity_id,action,from_status,to_status,reason) values((select auth.uid()),'KYC',k.id,'ADMIN_REVIEW',old,p_status,p_reason);
 return k;
end $$;
revoke all on function public.marketplace_admin_review_kyc(uuid,text,text) from public,anon,authenticated;

create or replace function public.marketplace_admin_review_payout_account(p_account_id uuid,p_status text,p_reason text default null)
returns public.marketplace_payout_accounts language plpgsql security definer set search_path=public as $$
declare a public.marketplace_payout_accounts; old text;
begin
 if not public.is_admin((select auth.uid())) then raise exception 'ADMIN_ONLY'; end if;
 if p_status not in ('ACTIVE','DISABLED') then raise exception 'INVALID_ACCOUNT_STATUS'; end if;
 select * into a from public.marketplace_payout_accounts where id=p_account_id for update;
 if a.id is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 old:=a.status;
 update public.marketplace_payout_accounts set status=p_status,kyc_status=case when p_status='ACTIVE' then 'VERIFIED' else kyc_status end,updated_at=now() where id=p_account_id returning * into a;
 insert into public.marketplace_financial_audit(actor_id,entity_type,entity_id,action,from_status,to_status,reason) values((select auth.uid()),'PAYOUT_ACCOUNT',a.id,'ADMIN_REVIEW',old,p_status,p_reason);
 return a;
end $$;
revoke all on function public.marketplace_admin_review_payout_account(uuid,text,text) from public,anon,authenticated;

create or replace function public.marketplace_admin_process_payout(p_payout_id uuid,p_status text,p_external_provider text default null,p_external_reference text default null,p_reason text default null)
returns public.marketplace_payouts language plpgsql security definer set search_path=public as $$
declare p public.marketplace_payouts; old text;
begin
 if not public.is_admin((select auth.uid())) then raise exception 'ADMIN_ONLY'; end if;
 if p_status not in ('PROCESSING','PAID','FAILED','CANCELLED') then raise exception 'INVALID_PAYOUT_STATUS'; end if;
 select * into p from public.marketplace_payouts where id=p_payout_id for update;
 if p.id is null then raise exception 'PAYOUT_NOT_FOUND'; end if;
 old:=p.status;
 if old='REQUESTED' and p_status not in ('PROCESSING','CANCELLED') then raise exception 'INVALID_PAYOUT_TRANSITION'; end if;
 if old='PROCESSING' and p_status not in ('PAID','FAILED','CANCELLED') then raise exception 'INVALID_PAYOUT_TRANSITION'; end if;
 if old in ('PAID','FAILED','CANCELLED') then raise exception 'PAYOUT_FINAL'; end if;
 if p_status='PAID' and nullif(trim(coalesce(p_external_reference,'')),'') is null then raise exception 'EXTERNAL_REFERENCE_REQUIRED'; end if;
 update public.marketplace_payouts set status=p_status,external_provider=coalesce(p_external_provider,external_provider),external_reference_id=coalesce(p_external_reference,external_reference_id),failure_reason=case when p_status='FAILED' then p_reason else null end,processed_at=case when p_status in ('PAID','FAILED','CANCELLED') then now() else processed_at end,updated_at=now() where id=p_payout_id returning * into p;
 insert into public.marketplace_financial_audit(actor_id,entity_type,entity_id,action,from_status,to_status,reason,metadata) values((select auth.uid()),'PAYOUT',p.id,'ADMIN_PROCESS',old,p_status,p_reason,jsonb_build_object('external_provider',p_external_provider,'external_reference',p_external_reference));
 return p;
end $$;
revoke all on function public.marketplace_admin_process_payout(uuid,text,text,text,text) from public,anon,authenticated;
