-- Minimize PostgREST role privileges. RLS remains the authorization layer; these grants remove unnecessary write/truncate surfaces.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.address_cards FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.favorites FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.identity_verifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_country_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.identity_verifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organization_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organizations FROM authenticated;
REVOKE TRUNCATE ON public.address_cards, public.favorites, public.user_country_profiles FROM authenticated;
