import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { eventosSync } from '@/sync/eventos';
import { obterRepositoriosSync } from '@/sync/fila';
import { estadoSync, sincronizar, type ResumoSync } from '@/sync/motorSync';

import { useSessao } from './useSessao';

export interface FilaSync {
  /** Operações do utilizador ainda por enviar. */
  pendentes: number;
  /** Fotos/assinaturas dessas operações ainda por enviar. */
  fotosPendentes: number;
  aSincronizar: boolean;
  /** Última vez que se falou com o servidor sem erro (ISO), ou null. */
  ultimaSincronizacao: string | null;
  /** Mensagem simples para mostrar ao utilizador, ou null. */
  ultimoErro: string | null;
  precisaEntrarDeNovo: boolean;
  /** Botão "Sincronizar agora": não espera a pausa entre tentativas. */
  sincronizarAgora(): Promise<ResumoSync>;
}

/** Estado da fila de saída e do motor de sincronização, para os ecrãs. */
export function useFilaSync(): FilaSync {
  const estado = useSyncExternalStore(estadoSync.subscrever, estadoSync.obter, estadoSync.obter);
  const userId = useSessao().utilizador?.id ?? null;
  const [contagens, setContagens] = useState({ pendentes: 0, fotosPendentes: 0 });

  useEffect(() => {
    let ativo = true;
    const ler = async () => {
      if (!userId) {
        setContagens({ pendentes: 0, fotosPendentes: 0 });
        return;
      }
      try {
        const { fila, ficheiros } = await obterRepositoriosSync();
        const [pendentes, fotosPendentes] = await Promise.all([
          fila.contarPendentesDoUtilizador(userId),
          ficheiros.contarPendentesDoUtilizador(userId),
        ]);
        if (ativo) setContagens({ pendentes, fotosPendentes });
      } catch {
        // Mantém os últimos números.
      }
    };
    void ler();
    const pararA = eventosSync.ouvir('sincronizado', () => void ler());
    const pararB = eventosSync.ouvir('operacaoAcrescentada', () => void ler());
    return () => {
      ativo = false;
      pararA();
      pararB();
    };
  }, [userId]);

  const sincronizarAgora = useCallback(() => sincronizar({ forcar: true }), []);

  return { ...contagens, ...estado, sincronizarAgora };
}
