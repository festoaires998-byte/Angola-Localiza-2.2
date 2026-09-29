-- PostGIS metadata is not part of the application's public REST surface.
-- Revoke direct read access from API roles while leaving the extension installed for internal spatial operations.
REVOKE SELECT ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated;
