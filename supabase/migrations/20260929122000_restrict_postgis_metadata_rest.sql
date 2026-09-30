-- PostGIS metadata is not part of the application's public REST surface.
-- ATENÇÃO (30/09/2026): aplicada em produção, mas sem efeito. A tabela
-- spatial_ref_sys pertence a supabase_admin e o papel "postgres" não lhe pode
-- tirar privilégios (o REVOKE só dá um aviso). anon/authenticated continuam a
-- poder escrever nela pela API. Solução: pedir ao suporte do Supabase para
-- retirar os privilégios, ou mover a extensão PostGIS para o esquema
-- "extensions" (ver BACKLOG.md).
revoke all on table public.spatial_ref_sys from public, anon, authenticated;
