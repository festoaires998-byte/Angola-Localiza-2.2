-- Harden access to identity artifact audit records.
-- SECURITY DEFINER RPCs that are not intended as public API entry points have
-- had EXECUTE revoked directly in the database; this migration records the RLS
-- policy applied to the audit table.

DROP POLICY IF EXISTS "identity_artifact_views_admin_select" ON public.identity_artifact_views;
CREATE POLICY "identity_artifact_views_admin_select"
ON public.identity_artifact_views
FOR SELECT
TO authenticated
USING ((SELECT public.is_admin((SELECT auth.uid()))));
