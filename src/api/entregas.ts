import { lerEnvio, lerPin, type Envio, type PedidoEnvio, type PinEnvio } from '@/domain/entregas/envio';

import { chamarFuncao } from './edge/chamarFuncao';
import { supabase } from './supabase';

/**
 * Separador Enviar: ligação à Edge Function "deliveries" (v19) e à tabela
 * deliveries (só as colunas públicas: o PIN nunca vem por aqui).
 */

/** Colunas que quem criou pode ler diretamente (as mesmas que o site pede). */
const COLUNAS =
  'id, tracking_code, status, recipient_name, recipient_phone, instructions, is_urgent, created_by, assigned_driver, created_at, updated_at, origin_latitude, origin_longitude, origin_postal_code, origin_plus_code, cargo_type, cargo_description, cargo_quantity, cargo_weight_kg, cargo_length_cm, cargo_width_cm, cargo_height_cm, cargo_declared_value, requested_vehicle_type, requested_vehicle_capacity_kg, addresses(postal_code, plus_code, reference, latitude, longitude)';

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

/** Altera a prioridade urgente de uma entrega criada pelo utilizador. */
export async function definirUrgenciaEnvio(deliveryId: string, urgente: boolean): Promise<void> {
  await chamarFuncao('deliveries', 'set_urgent', { body: { delivery_id: deliveryId, is_urgent: urgente } });
}

/** As entregas atribuídas ao estafeta (separador Entregas), das mais recentes para as mais antigas. */
/** Atualiza a última posição do estafeta no tracking da entrega ativa. */
export async function atualizarTrackingEntrega(
  deliveryId: string,
  posicao: { latitude: number; longitude: number; precisao: number | null; hora: number },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('atualizar_delivery_tracking', {
    p_delivery_id: deliveryId,
    p_latitude: posicao.latitude,
    p_longitude: posicao.longitude,
    p_accuracy_meters: posicao.precisao,
    p_updated_at: new Date(posicao.hora).toISOString(),
  });
  if (error) throw new Error(error.message);
  return data === true;
}

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

export type EstafetaDisponivel = { id: string; email: string | null; nome: string | null };

export async function listarEstafetasDisponiveis(deliveryId: string): Promise<EstafetaDisponivel[]> {
  const r = await chamarFuncao<{ drivers?: EstafetaDisponivel[] }>('deliveries', 'list_org_drivers', { body: { delivery_id: deliveryId } });
  return Array.isArray(r?.drivers) ? r.drivers : [];
}

export async function atribuirEstafeta(deliveryId: string, driverId: string): Promise<void> {
  await chamarFuncao('deliveries', 'assign_driver', { body: { delivery_id: deliveryId, driver_id: driverId } });
}

/** Permite ao próprio estafeta aceitar um pedido disponível. O servidor garante exclusividade atómica. */
export type PedidoDisponivelEstafeta = Envio & {
  compatibilidade: 'COMPATIVEL' | 'ALTERNATIVA';
  motivos: string[];
};

export async function listarPedidosDisponiveisEstafeta(): Promise<{
  pedidos: PedidoDisponivelEstafeta[];
  estafeta: { online: boolean; status: string; vehicle_type: string | null; vehicle_capacity_kg: number | null };
}> {
  const r = await chamarFuncao<{
    deliveries?: unknown[];
    driver?: { online?: boolean; status?: string; vehicle_type?: string | null; vehicle_capacity_kg?: number | null };
  }>('deliveries', 'list_available_for_driver');
  const d = r?.driver ?? {};
  return {
    pedidos: Array.isArray(r?.deliveries)
      ? r.deliveries.map((x) => {
          const e = lerEnvio(x);
          const raw = x as Record<string, unknown>;
          return {
            ...e,
            compatibilidade: raw.compatibilidade === 'COMPATIVEL' ? 'COMPATIVEL' : 'ALTERNATIVA',
            motivos: Array.isArray(raw.motivos) ? raw.motivos.filter((m): m is string => typeof m === 'string') : [],
          };
        })
      : [],
    estafeta: {
      online: d.online === true,
      status: d.status ?? 'PENDING',
      vehicle_type: d.vehicle_type ?? null,
      vehicle_capacity_kg: typeof d.vehicle_capacity_kg === 'number' ? d.vehicle_capacity_kg : null,
    },
  };
}

export async function aceitarEntrega(deliveryId: string): Promise<void> {
  await chamarFuncao('deliveries', 'accept_delivery', { body: { delivery_id: deliveryId } });
}

/** Reabre uma entrega falhada para uma nova tentativa, seguindo a mesma transição usada pelo site. */
export async function reagendarTentativa(deliveryId: string): Promise<void> {
  await chamarFuncao('deliveries', 'update_status', { body: { delivery_id: deliveryId, new_status: 'ASSIGNED' } });
}
