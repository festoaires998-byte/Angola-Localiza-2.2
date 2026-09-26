import { useEffect } from 'react';

import { listarDaOrganizacao } from '@/api/entregas';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioEntregas } from '@/database/repositories/entregas';
import { servicoEstafeta } from '@/services/entregas/estafetaApp';
import { lojaEstafeta, useEstafeta, type EstadoEstafeta } from '@/state/estafeta';
import { eventosSync } from '@/sync/eventos';

import { useRealtimeEntregas } from './useRealtimeEntregas';

/** Lê as entregas atribuídas e as ações na fila e guarda-as na loja partilhada. */
export async function recarregarEstafeta(userId: string, online: boolean): Promise<void> {
  const [lista, acoes] = await Promise.all([
    servicoEstafeta.listar(userId, online),
    servicoEstafeta.acoes(userId).catch(() => []),
  ]);
  lojaEstafeta.definir((e) => ({ ...e, entregas: lista.entregas, doServidor: lista.doServidor, erro: lista.erro, acoes }));
}

/** Carrega a visão administrativa das entregas da organização. */
export async function recarregarEntregasOrganizacao(): Promise<void> {
  const entregas = await listarDaOrganizacao();
  const db = await abrirBaseDados();
  await criarRepositorioEntregas(db).guardarVarias(entregas);
  lojaEstafeta.definir((e) => ({ ...e, entregas, doServidor: true, erro: null, acoes: [] }));
}

/**
 * Entregas do estafeta: lê ao abrir e sempre que a fila muda (uma ação feita
 * sem rede que sai, ou que o servidor recusa).
 */
export function useEntregasEstafeta(userId: string | null, online: boolean | null): EstadoEstafeta {
  const estado = useEstafeta();
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
