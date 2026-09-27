-- is_admin is an authenticated/server-side authorization helper; anonymous callers do not need EXECUTE.
revoke execute on function public.is_admin(uuid) from anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
