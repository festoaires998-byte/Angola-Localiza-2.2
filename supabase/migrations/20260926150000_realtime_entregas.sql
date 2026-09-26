-- Realtime das entregas: o cliente recebe o evento e volta a ler o estado
-- autorizado pela consulta normal. O evento não é fonte única de verdade.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;
end
$$;
