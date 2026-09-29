-- Require authenticated sessions for user-owned and operational RLS policies.
-- Public reference-data reads remain public intentionally.

alter policy "Criar cartão próprio" on public.address_cards to authenticated;
alter policy "Ver os próprios cartões" on public.address_cards to authenticated;
alter policy "Ver versões de moradas visíveis" on public.address_versions to authenticated;
alter policy "Criar morada própria" on public.addresses to authenticated;
alter policy "Ver as próprias chaves da organização" on public.api_keys to authenticated;
alter policy "Apenas admins veem auditoria" on public.audit_logs to authenticated;
alter policy "Ver entregas relevantes" on public.deliveries to authenticated;
alter policy "Ver provas de entregas relevantes" on public.delivery_proofs to authenticated;
alter policy "Favorito só de morada visível (criar)" on public.favorites to authenticated;
alter policy "Favorito só de morada visível (mudar)" on public.favorites to authenticated;
alter policy "Gerir os próprios favoritos" on public.favorites to authenticated;
alter policy "Criar levantamento próprio" on public.field_records to authenticated;
alter policy "Ver os próprios levantamentos ou como admin" on public.field_records to authenticated;
alter policy "Vê as próprias submissões ou como revisor" on public.identity_verifications to authenticated;
alter policy "Ver erros dos próprios imports" on public.import_errors to authenticated;
alter policy "Ver os próprios imports" on public.imports to authenticated;
alter policy "Ver usos dos próprios links ou como admin" on public.join_link_uses to authenticated;
alter policy "Ver os próprios links ou como admin" on public.join_links to authenticated;
alter policy "Marcar as próprias notificações como lidas" on public.notifications to authenticated;
alter policy "Ver as próprias notificações" on public.notifications to authenticated;
alter policy "Ver a própria filiação" on public.organization_members to authenticated;
alter policy "Ver tabela negociada da própria organização" on public.organization_pricing_overrides to authenticated;
alter policy "Super admin vê todos os setores" on public.organizations to authenticated;
alter policy "Ver as próprias organizações" on public.organizations to authenticated;
alter policy "Ver atribuições de código postal" on public.postal_code_assignments to authenticated;
alter policy "Criar QR Code próprio" on public.qr_codes to authenticated;
alter policy "Revogar QR Code próprio" on public.qr_codes to authenticated;
alter policy "Ver os próprios QR Codes" on public.qr_codes to authenticated;
alter policy "Apagar o próprio histórico" on public.search_history to authenticated;
alter policy "Criar entrada no próprio histórico" on public.search_history to authenticated;
alter policy "Ver o próprio histórico" on public.search_history to authenticated;
alter policy "Ver as próprias operações de sync" on public.sync_operations to authenticated;
alter policy "Ver eventos de faturação relevantes" on public.usage_events to authenticated;
alter policy "Vê o próprio estado de identidade" on public.user_identity to authenticated;