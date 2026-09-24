import { useSyncExternalStore } from 'react';

import type { PedidoKyc } from '@/domain/identidade/revisaoKyc';

import { criarLoja } from './loja';

/**
 * Estado do separador Admin partilhado entre a lista e o ecrã de detalhe (Stack):
 * a lista continua montada por baixo do detalhe, e ao voltar vê a decisão
 * tomada (o pedido sai da lista e aparece o aviso).
 */
export interface AvisoRevisao {
  tipo: 'sucesso' | 'info' | 'erro';
  texto: string;
}

export interface EstadoRevisaoKyc {
  /** null = ainda não se pediu a lista. */
  pedidos: PedidoKyc[] | null;
  aviso: AvisoRevisao | null;
}

export const lojaRevisaoKyc = criarLoja<EstadoRevisaoKyc>({ pedidos: null, aviso: null });

export function useRevisaoKyc(): EstadoRevisaoKyc {
  return useSyncExternalStore(lojaRevisaoKyc.subscrever, lojaRevisaoKyc.obter, lojaRevisaoKyc.obter);
}

/** Depois de aprovar ou recusar: o pedido sai da lista e fica o aviso para quando se voltar. */
export function marcarDecidido(userId: string, aviso: AvisoRevisao): void {
  lojaRevisaoKyc.definir((e) => ({ pedidos: (e.pedidos ?? []).filter((p) => p.userId !== userId), aviso }));
}
