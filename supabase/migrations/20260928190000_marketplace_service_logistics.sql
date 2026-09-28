-- Integração segura Marketplace de Serviços -> Entregas.
create table if not exists public.marketplace_service_logistics (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.marketplace_service_bookings(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  country_code text not null references public.country_configs(country_code),
  delivery_id uuid unique references public.deliveries(id) on delete set null,
  status text not null default 'REQUESTED' check(status in ('REQUESTED','CREATED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketplace_service_logistics enable row level security;
drop policy if exists "marketplace logistics participants" on public.marketplace_service_logistics;
create policy "marketplace logistics participants"
on public.marketplace_service_logistics for select to authenticated
using (
  requested_by=auth.uid()
  or exists(select 1 from public.marketplace_service_bookings b where b.id=booking_id and b.client_id=auth.uid())
  or exists(select 1 from public.marketplace_service_bookings b join public.marketplace_service_profiles p on p.id=b.provider_id where b.id=booking_id and p.owner_id=auth.uid())
  or public.is_admin(auth.uid())
);
revoke insert,update,delete on public.marketplace_service_logistics from anon,authenticated;
create index if not exists marketplace_service_logistics_delivery_idx on public.marketplace_service_logistics(delivery_id);
create index if not exists marketplace_service_logistics_status_idx on public.marketplace_service_logistics(status,country_code);
