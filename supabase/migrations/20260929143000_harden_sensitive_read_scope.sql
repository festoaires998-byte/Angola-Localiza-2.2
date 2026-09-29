-- Harden RLS scope inheritance for sensitive operational reads
-- Keeps owner access while replacing broad admin bypasses with territorial/org scope.

drop policy if exists "Ver provas de entregas relevantes" on public.delivery_proofs;
create policy "Ver provas de entregas relevantes" on public.delivery_proofs for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_proofs.delivery_id
      and (
        d.created_by = auth.uid()
        or d.assigned_driver = auth.uid()
        or private.can_access_scope(auth.uid(), d.country_code, d.origin_province_id, d.origin_municipality_id, d.organization_id)
      )
  )
);

drop policy if exists "delivery_tracking_select_relevant" on public.delivery_tracking;
create policy "delivery_tracking_select_relevant" on public.delivery_tracking for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_tracking.delivery_id
      and (
        d.created_by = auth.uid()
        or d.assigned_driver = auth.uid()
        or private.can_access_scope(auth.uid(), d.country_code, d.origin_province_id, d.origin_municipality_id, d.organization_id)
      )
  )
);

drop policy if exists "Ver os próprios cartões" on public.address_cards;
create policy "Ver os próprios cartões" on public.address_cards for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.addresses a
    where a.id = address_cards.address_id
      and private.can_access_scope(auth.uid(), a.country_code, a.province_id, a.municipality_id, null)
  )
);

drop policy if exists "Ver os próprios QR Codes" on public.qr_codes;
create policy "Ver os próprios QR Codes" on public.qr_codes for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.addresses a
    where a.id = qr_codes.address_id
      and private.can_access_scope(auth.uid(), a.country_code, a.province_id, a.municipality_id, null)
  )
  or exists (
    select 1 from public.deliveries d
    where d.id = qr_codes.delivery_id
      and private.can_access_scope(auth.uid(), d.country_code, d.origin_province_id, d.origin_municipality_id, d.organization_id)
  )
);

drop policy if exists "Revogar QR Code próprio" on public.qr_codes;
create policy "Revogar QR Code próprio" on public.qr_codes for update to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.addresses a
    where a.id = qr_codes.address_id
      and private.can_access_scope(auth.uid(), a.country_code, a.province_id, a.municipality_id, null)
  )
  or exists (
    select 1 from public.deliveries d
    where d.id = qr_codes.delivery_id
      and private.can_access_scope(auth.uid(), d.country_code, d.origin_province_id, d.origin_municipality_id, d.organization_id)
  )
);

drop policy if exists "Ver os próprios exports" on public.exports;
create policy "Ver os próprios exports" on public.exports for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id in (
        select organization_id from public.organization_members om2 where om2.user_id = exports.created_by
      )
  )
);

drop policy if exists "Ver os próprios imports" on public.imports;
create policy "Ver os próprios imports" on public.imports for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = imports.organization_id
  )
);
