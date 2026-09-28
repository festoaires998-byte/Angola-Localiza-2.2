-- Motorista/KYC: fechar o RLS do perfil operacional.
alter table public.driver_profiles enable row level security;

drop policy if exists "Motorista vê o próprio perfil" on public.driver_profiles;
create policy "Motorista vê o próprio perfil"
on public.driver_profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Administradores vêem perfis de motorista" on public.driver_profiles;
create policy "Administradores vêem perfis de motorista"
on public.driver_profiles for select
to authenticated
using (public.is_admin(auth.uid()));

revoke insert, update, delete on public.driver_profiles from anon, authenticated;
