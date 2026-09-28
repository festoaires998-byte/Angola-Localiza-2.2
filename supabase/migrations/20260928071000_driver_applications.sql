create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null default 'AO' references public.country_configs(country_code),
  status text not null default 'PENDING_REVIEW',
  vehicle_type text, vehicle_plate text, license_number text, license_expiry date,
  id_document_path text, license_front_path text, license_back_path text,
  vehicle_document_path text, selfie_path text,
  submitted_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
  rejection_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint driver_applications_status_ck check (status in ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED')),
  constraint driver_applications_country_ck check (country_code in ('AO','MZ','CV','GW','ST')),
  constraint driver_applications_one_per_user unique (user_id)
);
alter table public.driver_applications enable row level security;
drop policy if exists "Candidato vê a própria candidatura" on public.driver_applications;
create policy "Candidato vê a própria candidatura" on public.driver_applications for select to authenticated using (user_id = auth.uid());
drop policy if exists "Administradores vêem candidaturas de motorista" on public.driver_applications;
create policy "Administradores vêem candidaturas de motorista" on public.driver_applications for select to authenticated using (public.is_admin(auth.uid()));
revoke insert, update, delete on public.driver_applications from anon, authenticated;
create index if not exists driver_applications_review_idx on public.driver_applications(status, country_code, submitted_at);
create index if not exists driver_applications_user_idx on public.driver_applications(user_id);