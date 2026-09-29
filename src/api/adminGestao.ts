import { obterConfigSupabase } from '@/config/env';
import { supabase } from './supabase';

const { url, chaveAnon } = obterConfigSupabase();

export type AdminTab = 'operacao' | 'pessoas' | 'dados' | 'financeiro' | 'programadores' | 'auditoria';

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Volta a entrar.');
  return token;
}

export async function chamarAdminGet<T = any>(action: string): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${url}/functions/v1/admin?action=${encodeURIComponent(action)}`, {
    headers: { apikey: chaveAnon, Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) throw new Error(data?.error || `Operação admin falhou (HTTP ${r.status}).`);
  return data as T;
}

export async function chamarAdmin<T = any>(action: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${url}/functions/v1/admin?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: chaveAnon,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) throw new Error(data?.error || `Operação admin falhou (HTTP ${r.status}).`);
  return data as T;
}

export async function chamarEndpoint<T = any>(nome: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${url}/functions/v1/${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: chaveAnon, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) throw new Error(data?.error || `Operação falhou (HTTP ${r.status}).`);
  return data as T;
}

export async function chamarFuncao<T = any>(nome: string, action: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${url}/functions/v1/${nome}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: chaveAnon, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) throw new Error(data?.error || `Operação falhou (HTTP ${r.status}).`);
  return data as T;
}

export async function restGet<T = any>(path: string): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: chaveAnon, Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || `Consulta falhou (HTTP ${r.status}).`);
  return data as T;
}

export async function restPatch<T = any>(path: string, body: unknown): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      apikey: chaveAnon,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || `Alteração falhou (HTTP ${r.status}).`);
  return data as T;
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  admin_nacional: 'Admin nacional',
  admin_provincial: 'Admin provincial',
  admin_municipal: 'Admin municipal',
  supervisor: 'Supervisor',
  auditor: 'Auditor',
  operador_postal: 'Operador postal',
  tecnico_campo: 'Técnico de campo',
  estafeta: 'Estafeta',
};

export const AUDIT_LABELS: Record<string, string> = {
  address_approved: 'Morada aprovada',
  address_rejected: 'Morada rejeitada',
  address_suspended: 'Morada suspensa',
  user_invited: 'Utilizador convidado',
  role_changed: 'Cargo alterado',
  role_assigned_existing_user: 'Cargo atribuído a conta existente',
  field_record_submitted: 'Levantamento de campo submetido',
  field_record_merged: 'Levantamento fundido',
  delivery_delivered_with_pod: 'Entrega concluída com prova',
  delivery_failed_flagged_address: 'Entrega falhou — morada sinalizada',
  pricing_zone_updated: 'Banda de preço alterada',
  join_link_created: 'Link de convite criado',
  joined_via_link: 'Entrada via link',
  join_link_anomaly_flagged: 'Link sinalizado',
  street_mode_changed: 'Modo de numeração alterado',
  address_renumbered_n9: 'Porta renumerada',
  identity_submitted: 'Identidade submetida',
  identity_attested_presencial: 'Identidade atestada presencialmente',
  identity_org_attestation: 'Identidade atestada pela organização',
  identity_reviewed: 'Identidade revista',
  identity_artifact_viewed: 'Artefacto de identidade visualizado',
};
