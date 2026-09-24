import { estadoDoServidor, type EstadoCidadao } from '@/domain/identidade/verificacaoSimples';

/** Leitura das respostas da citizen-verify (sem rede: testável). */

export interface EstadoVerificacaoServidor {
  estado: EstadoCidadao;
  /** Motivo da recusa, se foi recusada. */
  motivo: string | null;
}

/** Lê a resposta de citizen-verify (status ou submit). */
export function lerEstadoVerificacao(r: unknown): EstadoVerificacaoServidor {
  const o = (r ?? {}) as { error?: unknown; citizen_id_verified?: unknown; citizen_id_status?: unknown; status?: unknown; rejection_reason?: unknown };
  if (o.error) throw new Error(String(o.error));
  return {
    estado: estadoDoServidor(o.citizen_id_verified, o.citizen_id_status ?? o.status),
    motivo: typeof o.rejection_reason === 'string' && o.rejection_reason.trim() ? o.rejection_reason.trim() : null,
  };
}
