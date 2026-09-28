-- Activate the configured PALOP country runtime.
-- Angola remains the default; this migration only enables country configuration
-- already provisioned by the multi-country territorial runtime migrations.
update public.country_configs
set enabled = true, updated_at = now()
where country_code in ('AO','MZ','CV','GW','ST');
