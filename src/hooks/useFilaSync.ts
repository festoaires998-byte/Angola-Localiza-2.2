import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { TipoOperacao } from '@/database/repositories/filaSaida';

import { eventosSync } from '@/sync/eventos';
import { obterRepositoriosSync } from '@/sync/fila';
import { estadoSync, sincronizar, type ResumoSync } from '@/sync/motorSync';

import { useSessao } from './useSessao';

/** Operação que falhou de vez e precisa da atenção do utilizador. */
export interface OperacaoComProblema {
  operation_id: string;
  operation_type: TipoOperacao;
  /** Porque falhou, ex.: "A foto foi alterada ou danificada depois de ser tirada". */
  erro: string;
  criado_em: string;
}

export interface FilaSync {
  /** Operações do utilizador ainda por enviar. */
  pendentes: number;
  /** Fotos/assinaturas dessas operações ainda por enviar. */
  fotosPendentes: number;
  /**
   * Operações que já não vão ser enviadas (estado "falhou_definitivo"),
   * ex.: foto alterada ou danificada. Os ficheiros locais ficam guardados.
   */
  operacoesComProblema: OperacaoComProblema[];
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
  const [contagens, setContagens] = useState<{
    pendentes: number;
    fotosPendentes: number;
    operacoesComProblema: OperacaoComProblema[];
  }>({ pendentes: 0, fotosPendentes: 0, operacoesComProblema: [] });

  useEffect(() => {
    let ativo = true;
    const ler = async () => {
      if (!userId) {
        setContagens({ pendentes: 0, fotosPendentes: 0, operacoesComProblema: [] });
        return;
      }
      try {
        const { fila, ficheiros } = await obterRepositoriosSync();
        const [pendentes, fotosPendentes, falhadas] = await Promise.all([
          fila.contarPendentesDoUtilizador(userId),
          ficheiros.contarPendentesDoUtilizador(userId),
          fila.listarFalhadasDoUtilizador(userId),
        ]);
        const operacoesComProblema = falhadas.map((o) => ({
          operation_id: o.operation_id,
          operation_type: o.operation_type,
          erro: o.ultimo_erro ?? 'Não foi possível enviar.',
          criado_em: o.criado_em,
        }));
        if (ativo) setContagens({ pendentes, fotosPendentes, operacoesComProblema });
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
