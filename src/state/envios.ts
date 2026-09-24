import { useSyncExternalStore } from 'react';

import type { Envio, PinEnvio } from '@/domain/entregas/envio';
import type { EnvioPorEnviar } from '@/services/entregas/envios';

import { criarLoja } from './loja';

/**
 * Estado do separador Enviar partilhado entre a lista, o "Novo envio" e o
 * detalhe (Stack): ao voltar, a lista já tem o envio novo, o cancelamento e o aviso.
 * O PIN fica só aqui, na memória (nunca na base de dados do telemóvel).
 */
export interface AvisoEnvios {
  tipo: 'sucesso' | 'info' | 'erro';
  texto: string;
}

export interface EstadoEnvios {
  /** null = ainda não se leu. */
  envios: Envio[] | null;
  porEnviar: EnvioPorEnviar[];
  /** A lista veio do servidor (senão, é a guardada no telemóvel). */
  doServidor: boolean;
  erro: string | null;
  aviso: AvisoEnvios | null;
  /** PIN já mostrado nesta sessão da app, por id da entrega. */
  pins: Record<string, PinEnvio>;
}

/** Aviso na lista quando o pedido ficou na fila (sem rede). */
export const AVISO_NA_FILA =
  'Sem rede: o pedido ficou guardado neste telemóvel e é enviado sozinho quando a rede voltar. O código de rastreio e o PIN aparecem depois nesta lista.';

export const ESTADO_INICIAL_ENVIOS: EstadoEnvios = {
  envios: null,
  porEnviar: [],
  doServidor: false,
  erro: null,
  aviso: null,
  pins: {},
};

export const lojaEnvios = criarLoja<EstadoEnvios>(ESTADO_INICIAL_ENVIOS);

export function useEnvios(): EstadoEnvios {
  return useSyncExternalStore(lojaEnvios.subscrever, lojaEnvios.obter, lojaEnvios.obter);
}

/** Põe (ou troca) um envio na lista, no topo. */
export function guardarEnvio(envio: Envio, pin?: PinEnvio | null, aviso?: AvisoEnvios): void {
  lojaEnvios.definir((e) => ({
    ...e,
    envios: [envio, ...(e.envios ?? []).filter((x) => x.id !== envio.id)],
    pins: pin ? { ...e.pins, [envio.id]: pin } : e.pins,
    aviso: aviso ?? e.aviso,
  }));
}

export function guardarPin(id: string, pin: PinEnvio): void {
  lojaEnvios.definir((e) => ({ ...e, pins: { ...e.pins, [id]: pin } }));
}

export function definirAvisoEnvios(aviso: AvisoEnvios | null): void {
  lojaEnvios.definir((e) => ({ ...e, aviso }));
}
