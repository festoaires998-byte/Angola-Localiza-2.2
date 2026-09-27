-- SECURITY DEFINER helpers must use a controlled search_path.
-- PostGIS functions are explicitly schema-qualified to avoid object-shadowing.
alter function public.nearby_addresses(double precision,double precision,integer) set search_path='pg_catalog, public';
alter function public.nearby_for_duplicates(double precision,double precision,integer) set search_path='pg_catalog, public';
