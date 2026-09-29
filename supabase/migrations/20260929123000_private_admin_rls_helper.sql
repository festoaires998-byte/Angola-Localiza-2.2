-- Keep the admin RLS helper outside the PostgREST-exposed public schema.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = check_user_id
      AND role IN ('super_admin','admin_nacional','admin_provincial','admin_municipal')
  ) AND (
    check_user_id = auth.uid()
    OR coalesce(auth.jwt() ->> 'role','') = 'service_role'
    OR session_user <> 'authenticator'
  );
$function$;

REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;

-- Anonymous users receive only genuinely public address rows. Authenticated users
-- additionally receive their own/linked rows and administrator access.
ALTER POLICY "Ler moradas visíveis" ON public.addresses
USING ((status = ANY (ARRAY['APPROVED','OFFICIAL','PUBLISHED'])) AND (visibility_level IS DISTINCT FROM 'PRIVATE'));
DROP POLICY IF EXISTS "Ler moradas próprias ou ligadas" ON public.addresses;
CREATE POLICY "Ler moradas próprias ou ligadas" ON public.addresses
FOR SELECT TO authenticated
USING ((created_by = (SELECT auth.uid())) OR (id IN (SELECT privado.moradas_ligadas_a_mim())) OR private.is_admin((SELECT auth.uid())));

-- Existing authenticated RLS policies that used public.is_admin are rewritten to
-- call the private helper. This preserves their authorization semantics.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname,tablename,policyname,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND tablename <> 'addresses'
      AND (coalesce(qual,'') ILIKE '%is_admin(%' OR coalesce(with_check,'') ILIKE '%is_admin(%')
      AND roles::text LIKE '%authenticated%'
  LOOP
    IF r.cmd IN ('SELECT','DELETE','UPDATE') THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',r.policyname,r.schemaname,r.tablename,replace(r.qual,'is_admin(','private.is_admin('));
    END IF;
    IF r.cmd IN ('INSERT','UPDATE') AND r.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',r.policyname,r.schemaname,r.tablename,replace(r.with_check,'is_admin(','private.is_admin('));
    END IF;
  END LOOP;
END $$;
