-- Eventos do Marketplace e restantes módulos chegam à APP em tempo real.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='marketplace_service_bookings'
  ) then
    alter publication supabase_realtime add table public.marketplace_service_bookings;
  end if;
end $$;
