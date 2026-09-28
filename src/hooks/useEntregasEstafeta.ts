import { useEffect, useRef } from 'react';

import { atualizarTrackingEntrega, listarDaOrganizacao } from '@/api/entregas';
import { servicoEstafeta } from '@/services/entregas/estafetaApp';
import { lojaEstafeta, useEstafeta, type EstadoEstafeta } from '@/state/estafeta';
import { eventosSync } from '@/sync/eventos';

import { useRealtimeEntregas } from './useRealtimeEntregas';
import { usePosicao } from './usePosicao';

/** Lê as entregas atribuídas e as ações na fila e guarda-as na loja partilhada. */
export async function recarregarEstafeta(userId: string, online: boolean): Promise<void> {
  const [lista, acoes, disponiveis] = await Promise.all([
    servicoEstafeta.listar(userId, online),
    servicoEstafeta.acoes(userId).catch(() => []),
    online
      ? servicoEstafeta.listarDisponiveis().catch(() => ({ pedidos: [], estafeta: { online: false, status: 'PENDING', vehicle_type: null, vehicle_capacity_kg: null } }))
      : Promise.resolve({ pedidos: [], estafeta: { online: false, status: 'PENDING', vehicle_type: null, vehicle_capacity_kg: null } }),
  ]);
  lojaEstafeta.definir((e) => ({ ...e, entregas: lista.entregas, pedidosDisponiveis: disponiveis.pedidos, doServidor: lista.doServidor, erro: lista.erro, acoes }));
}

/** Carrega a visão administrativa das entregas da organização. */
export async function recarregarEntregasOrganizacao(): Promise<void> {
  const entregas = await listarDaOrganizacao();
  lojaEstafeta.definir((e) => ({ ...e, entregas, doServidor: true, erro: null, acoes: [] }));
}

/**
 * Entregas do estafeta: lê ao abrir e sempre que a fila muda (uma ação feita
 * sem rede que sai, ou que o servidor recusa).
 */
export function useEntregasEstafeta(userId: string | null, online: boolean | null): EstadoEstafeta {
  const estado = useEstafeta();
  const posicao = usePosicao();
  const ultimaEnviada = useRef(new Map<string, number>());
  useEffect(() => {
    if (!userId || online !== true || posicao.estado !== 'ok') return;
    const ativos = (estado.entregas ?? []).filter((e) => e.estafeta === userId && ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(e.estado));
    const agora = Date.now();
    for (const entrega of ativos) {
      const ultima = ultimaEnviada.current.get(entrega.id) ?? 0;
      if (agora - ultima < 10000) continue;
      ultimaEnviada.current.set(entrega.id, agora);
      void atualizarTrackingEntrega(entrega.id, posicao.posicao).catch(() => {
        ultimaEnviada.current.delete(entrega.id);
      });
    }
  }, [userId, online, posicao, estado.entregas]);

  useRealtimeEntregas(userId, 'estafeta', online === true, () => {
    if (userId) return recarregarEstafeta(userId, online === true);
  });
  useEffect(() => {
    if (!userId) return;
    const ler = () => void recarregarEstafeta(userId, online === true).catch(() => undefined);
    ler();
    const pararA = eventosSync.ouvir('sincronizado', ler);
    const pararB = eventosSync.ouvir('operacaoAcrescentada', ler);
    return () => {
      pararA();
      pararB();
    };
  }, [userId, online]);
  return estado;
}
