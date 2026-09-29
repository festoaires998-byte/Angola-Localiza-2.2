-- Harden user-owned mutations: favorites rely on the owner policy only; address cards require an owner;
-- country selection is immutable for client sessions after registration.
DROP POLICY IF EXISTS "Favorito só de morada visível (criar)" ON public.favorites;
DROP POLICY IF EXISTS "Favorito só de morada visível (mudar)" ON public.favorites;
DROP POLICY IF EXISTS "Criar cartão próprio" ON public.address_cards;
CREATE POLICY "Criar cartão próprio" ON public.address_cards FOR INSERT TO authenticated WITH CHECK (created_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS "user_country_profiles_update_own" ON public.user_country_profiles;
CREATE POLICY "user_country_profiles_update_own" ON public.user_country_profiles FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()) AND country_code=(SELECT old.country_code FROM public.user_country_profiles old WHERE old.user_id=(SELECT auth.uid())));
CREATE OR REPLACE FUNCTION private.prevent_country_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN IF NEW.country_code IS DISTINCT FROM OLD.country_code AND session_user='authenticator' THEN RAISE EXCEPTION 'country_code cannot be changed after registration'; END IF; RETURN NEW; END; $function$;
DROP TRIGGER IF EXISTS trg_prevent_country_change ON public.user_country_profiles;
CREATE TRIGGER trg_prevent_country_change BEFORE UPDATE ON public.user_country_profiles FOR EACH ROW EXECUTE FUNCTION private.prevent_country_change();
