create policy "Public can read active country configuration"
on public.country_configs
for select
to anon, authenticated
using (is_active = true);
