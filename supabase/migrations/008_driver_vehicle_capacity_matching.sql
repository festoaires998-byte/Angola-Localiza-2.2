-- Capacidade do veículo do estafeta para o matching de pedidos.
alter table public.driver_profiles
  add column if not exists vehicle_capacity_kg numeric(12,3);

alter table public.driver_applications
  add column if not exists vehicle_capacity_kg numeric(12,3);

alter table public.driver_profiles
  add constraint driver_profiles_vehicle_capacity_nonnegative
  check (vehicle_capacity_kg is null or vehicle_capacity_kg >= 0);

alter table public.driver_applications
  add constraint driver_applications_vehicle_capacity_nonnegative
  check (vehicle_capacity_kg is null or vehicle_capacity_kg >= 0);
