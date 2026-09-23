import type { OperacaoFila, TipoOperacao } from '@/database/repositories/filaSaida';
import type { ProvaEvidencia } from '@/database/repositories/provasEvidencia';

/** Operação que precisa da atenção do utilizador. */
export interface OperacaoComProblema {
  operation_id: string;
  operation_type: TipoOperacao;
  /**
   * - "falhou": não vai ser enviada (estado "falhou_definitivo");
   * - "aviso": foi enviada, mas há algo a saber (ex.: a assinatura da prova não
   *   confere com a chave registada; ficou uma cópia no telemóvel).
   */
  gravidade: 'falhou' | 'aviso';
  /** O que aconteceu, ex.: "A foto foi alterada ou danificada depois de ser tirada". */
  erro: string;
  criado_em: string;
}

/** Junta as operações falhadas e as provas guardadas como evidência (mais recentes primeiro). */
export function juntarProblemas(
  falhadas: Pick<OperacaoFila, 'operation_id' | 'operation_type' | 'ultimo_erro' | 'criado_em'>[],
  evidencias: Pick<ProvaEvidencia, 'operation_id' | 'motivo' | 'criada_em'>[],
): OperacaoComProblema[] {
  const lista: OperacaoComProblema[] = [
    ...falhadas.map((o) => ({
      operation_id: o.operation_id,
      operation_type: o.operation_type,
      gravidade: 'falhou' as const,
      erro: o.ultimo_erro ?? 'Não foi possível enviar.',
      criado_em: o.criado_em,
    })),
    ...evidencias.map((e) => ({
      operation_id: e.operation_id,
      operation_type: 'delivery_proof' as const,
      gravidade: 'aviso' as const,
      erro: e.motivo,
      criado_em: e.criada_em,
    })),
  ];
  return lista.sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0));
}
