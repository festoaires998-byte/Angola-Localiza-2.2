-- Dados de carga e requisitos do veículo para pedidos de envio.
alter table public.deliveries
  add column if not exists cargo_type text,
  add column if not exists cargo_description text,
  add column if not exists cargo_quantity integer,
  add column if not exists cargo_weight_kg numeric(12,3),
  add column if not exists cargo_length_cm numeric(10,2),
  add column if not exists cargo_width_cm numeric(10,2),
  add column if not exists cargo_height_cm numeric(10,2),
  add column if not exists cargo_declared_value numeric(14,2),
  add column if not exists requested_vehicle_type text,
  add column if not exists requested_vehicle_capacity_kg numeric(12,3);

alter table public.deliveries
  add constraint deliveries_cargo_quantity_positive check (cargo_quantity is null or cargo_quantity > 0),
  add constraint deliveries_cargo_weight_nonnegative check (cargo_weight_kg is null or cargo_weight_kg >= 0),
  add constraint deliveries_cargo_dimensions_nonnegative check (
    (cargo_length_cm is null or cargo_length_cm >= 0) and
    (cargo_width_cm is null or cargo_width_cm >= 0) and
    (cargo_height_cm is null or cargo_height_cm >= 0)
  ),
  add constraint deliveries_cargo_declared_value_nonnegative check (cargo_declared_value is null or cargo_declared_value >= 0),
  add constraint deliveries_vehicle_capacity_nonnegative check (requested_vehicle_capacity_kg is null or requested_vehicle_capacity_kg >= 0);
