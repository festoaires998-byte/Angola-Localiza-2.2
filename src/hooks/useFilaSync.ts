import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { eventosSync } from '@/sync/eventos';
import { obterRepositoriosSync } from '@/sync/fila';
import { estadoSync, sincronizar, type ResumoSync } from '@/sync/motorSync';
import { juntarProblemas, type OperacaoComProblema } from '@/sync/problemas';

import { useSessao } from './useSessao';

export type { OperacaoComProblema } from '@/sync/problemas';

export interface FilaSync {
  /** Operações do utilizador ainda por enviar. */
  pendentes: number;
  /** Fotos/assinaturas dessas operações ainda por enviar. */
  fotosPendentes: number;
  /**
   * Operações que já não vão ser enviadas (gravidade "falhou", ex.: foto
   * alterada ou danificada; os ficheiros locais ficam guardados) e provas
   * enviadas com um aviso (gravidade "aviso", ex.: assinatura que não confere
   * com a chave registada; ficou uma cópia local como evidência).
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
  /**
   * Botão "Já vi" de um aviso (gravidade "aviso"): deixa de aparecer na lista.
   * A prova continua guardada no telemóvel (nunca é apagada).
   */
  marcarAvisoVisto(operationId: string): Promise<void>;
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
  const [leituras, setLeituras] = useState(0);

  useEffect(() => {
    let ativo = true;
    const ler = async () => {
      if (!userId) {
        setContagens({ pendentes: 0, fotosPendentes: 0, operacoesComProblema: [] });
        return;
      }
      try {
        const { fila, ficheiros, evidencias } = await obterRepositoriosSync();
        const [pendentes, fotosPendentes, falhadas, provasEvidencia] = await Promise.all([
          fila.contarPendentesDoUtilizador(userId),
          ficheiros.contarPendentesDoUtilizador(userId),
          fila.listarFalhadasDoUtilizador(userId),
          evidencias.listarDoUtilizador(userId, { soNaoVistas: true }),
        ]);
        const operacoesComProblema = juntarProblemas(falhadas, provasEvidencia);
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
  }, [userId, leituras]);

  const sincronizarAgora = useCallback(() => sincronizar({ forcar: true }), []);

  const marcarAvisoVisto = useCallback(
    async (operationId: string) => {
      if (!userId) return;
      // Esconde logo; a base de dados guarda o "Já vi".
      setContagens((a) => ({
        ...a,
        operacoesComProblema: a.operacoesComProblema.filter(
          (o) => !(o.operation_id === operationId && o.gravidade === 'aviso'),
        ),
      }));
      const { evidencias } = await obterRepositoriosSync();
      await evidencias.marcarVista(userId, operationId);
      setLeituras((n) => n + 1);
    },
    [userId],
  );

  return { ...contagens, ...estado, sincronizarAgora, marcarAvisoVisto };
}
