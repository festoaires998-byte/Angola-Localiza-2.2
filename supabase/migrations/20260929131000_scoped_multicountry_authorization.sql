-- Enforce country/territorial scope for administrative RLS access.
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS country_code text;

CREATE OR REPLACE FUNCTION private.sync_delivery_country() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NEW.address_id IS NOT NULL THEN SELECT a.country_code INTO NEW.country_code FROM public.addresses a WHERE a.id=NEW.address_id; END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_sync_delivery_country ON public.deliveries;
CREATE TRIGGER trg_sync_delivery_country BEFORE INSERT OR UPDATE OF address_id ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.sync_delivery_country();
UPDATE public.deliveries d SET country_code=a.country_code FROM public.addresses a WHERE a.id=d.address_id AND d.country_code IS DISTINCT FROM a.country_code;

CREATE OR REPLACE FUNCTION private.can_access_scope(check_user_id uuid,target_country text,target_province uuid,target_municipality uuid,target_organization uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT EXISTS (SELECT 1 FROM public.organization_members om LEFT JOIN public.user_country_profiles ucp ON ucp.user_id=om.user_id WHERE om.user_id=check_user_id AND (om.role='super_admin' OR (om.role='admin_nacional' AND target_country IS NOT NULL AND ucp.country_code=target_country) OR (om.role='admin_provincial' AND target_province IS NOT NULL AND om.scope_province_id=target_province AND (ucp.country_code IS NULL OR ucp.country_code=target_country)) OR (om.role='admin_municipal' AND target_municipality IS NOT NULL AND om.scope_municipality_id=target_municipality AND (ucp.country_code IS NULL OR ucp.country_code=target_country))));
$function$;
REVOKE ALL ON FUNCTION private.can_access_scope(uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_access_scope(uuid,text,uuid,uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS "Ver entregas relevantes" ON public.deliveries;
CREATE POLICY "Ver entregas relevantes" ON public.deliveries FOR SELECT TO authenticated USING (created_by=(SELECT auth.uid()) OR assigned_driver=(SELECT auth.uid()) OR private.can_access_scope((SELECT auth.uid()),country_code,origin_province_id,origin_municipality_id,organization_id));
DROP POLICY IF EXISTS "Administradores vêem candidaturas de motorista" ON public.driver_applications;
CREATE POLICY "Administradores vêem candidaturas de motorista" ON public.driver_applications FOR SELECT TO authenticated USING (private.can_access_scope((SELECT auth.uid()),country_code,NULL,NULL,NULL));
DROP POLICY IF EXISTS "Administradores vêem perfis de motorista" ON public.driver_profiles;
CREATE POLICY "Administradores vêem perfis de motorista" ON public.driver_profiles FOR SELECT TO authenticated USING (private.can_access_scope((SELECT auth.uid()),country_code,NULL,NULL,NULL));
DROP POLICY IF EXISTS "Vê as próprias submissões ou como revisor" ON public.identity_verifications;
CREATE POLICY "Vê as próprias submissões ou como revisor" ON public.identity_verifications FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id=(SELECT auth.uid()) AND (om.role='super_admin' OR (om.role='auditor' AND om.organization_id=identity_verifications.organization_id))));
