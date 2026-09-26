import { lerEnvio, lerPin, type Envio, type PedidoEnvio, type PinEnvio } from '@/domain/entregas/envio';

import { chamarFuncao } from './edge/chamarFuncao';
import { supabase } from './supabase';

/**
 * Separador Enviar: ligação à Edge Function "deliveries" (v19) e à tabela
 * deliveries (só as colunas públicas: o PIN nunca vem por aqui).
 */

/** Colunas que quem criou pode ler diretamente (as mesmas que o site pede). */
const COLUNAS =
  'id, tracking_code, status, recipient_name, recipient_phone, instructions, is_urgent, created_by, assigned_driver, created_at, updated_at, origin_latitude, origin_longitude, origin_postal_code, origin_plus_code, addresses(postal_code, plus_code, reference, latitude, longitude)';

/** Cria a entrega. A resposta traz o PIN, que só se mostra (não se guarda). */
export async function criarEnvio(pedido: PedidoEnvio): Promise<{ envio: Envio; pin: PinEnvio | null }> {
  const r = await chamarFuncao<Record<string, unknown>>('deliveries', 'create', { body: pedido });
  let pin: PinEnvio | null = null;
  try {
    pin = lerPin({ pin: r?.confirmation_pin, expires_at: r?.confirmation_pin_expires_at });
  } catch {
    pin = null;
  }
  return { envio: lerEnvio(r), pin };
}

/** As entregas que o utilizador criou, das mais recentes para as mais antigas. */
export async function listarEnvios(userId: string): Promise<Envio[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(COLUNAS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Não foi possível ler os envios (${error.message}).`);
  return (data ?? []).map(lerEnvio);
}

export async function lerPinEnvio(deliveryId: string): Promise<PinEnvio> {
  return lerPin(await chamarFuncao('deliveries', 'get_pin', { body: { delivery_id: deliveryId } }));
}

export async function gerarPinNovo(deliveryId: string): Promise<PinEnvio> {
  return lerPin(await chamarFuncao('deliveries', 'regenerate_pin', { body: { delivery_id: deliveryId } }));
}

export async function cancelarEnvio(deliveryId: string): Promise<void> {
  await chamarFuncao('deliveries', 'update_status', { body: { delivery_id: deliveryId, new_status: 'CANCELLED' } });
}

/** As entregas atribuídas ao estafeta (separador Entregas), das mais recentes para as mais antigas. */
export async function listarAtribuidas(userId: string): Promise<Envio[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(COLUNAS)
    .eq('assigned_driver', userId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Não foi possível ler as entregas (${error.message}).`);
  return (data ?? []).map(lerEnvio);
}

/**
 * Visão operacional da organização para Operador Postal e Super Admin.
 * Usa a Edge Function que aplica as regras de autorização do módulo Entregas.
 */
export async function listarDaOrganizacao(): Promise<Envio[]> {
  const r = await chamarFuncao<{ deliveries?: unknown[] }>('deliveries', 'list_org_deliveries');
  return Array.isArray(r?.deliveries) ? r.deliveries.map(lerEnvio) : [];
}
