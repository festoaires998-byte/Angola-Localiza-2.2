import { useSyncExternalStore } from 'react';

import type { Envio } from '@/domain/entregas/envio';
import type { PedidoDisponivelEstafeta } from '@/api/entregas';
import type { AcaoNaFila } from '@/services/entregas/estafeta';

import { criarLoja } from './loja';

/** Estado do separador Entregas (estafeta), partilhado entre a lista, o detalhe e a prova. */
export interface AvisoEstafeta {
  tipo: 'sucesso' | 'info' | 'erro';
  texto: string;
}

export interface EstadoEstafeta {
  /** null = ainda não se leu. */
  entregas: Envio[] | null;
  pedidosDisponiveis: PedidoDisponivelEstafeta[];
  acoes: AcaoNaFila[];
  doServidor: boolean;
  erro: string | null;
  aviso: AvisoEstafeta | null;
}

export const ESTADO_INICIAL_ESTAFETA: EstadoEstafeta = { entregas: null, pedidosDisponiveis: [], acoes: [], doServidor: false, erro: null, aviso: null };

export const lojaEstafeta = criarLoja<EstadoEstafeta>(ESTADO_INICIAL_ESTAFETA);

export function useEstafeta(): EstadoEstafeta {
  return useSyncExternalStore(lojaEstafeta.subscrever, lojaEstafeta.obter, lojaEstafeta.obter);
}

export function definirAvisoEstafeta(aviso: AvisoEstafeta | null): void {
  lojaEstafeta.definir((e) => ({ ...e, aviso }));
}

/** Mensagem depois de uma ação posta na fila (com ou sem rede). */
export function avisoAcao(online: boolean | null, feito: string): AvisoEstafeta {
  return online
    ? { tipo: 'sucesso', texto: `${feito} A enviar para o servidor…` }
    : { tipo: 'info', texto: `${feito} Sem rede: fica guardado neste telemóvel e é enviado quando a rede voltar.` };
}
