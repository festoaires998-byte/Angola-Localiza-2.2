-- Corrige 403 ao avaliar a RLS de public.addresses para utilizadores autenticados.
-- A função só calcula permissões com base em auth.uid()/auth.jwt e é SECURITY DEFINER.
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to anon;
