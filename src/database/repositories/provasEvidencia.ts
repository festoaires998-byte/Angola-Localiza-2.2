import type { BaseDados } from '../tipos';
import { paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/**
 * Cópia local de uma prova de entrega enviada cuja assinatura não confere com
 * a chave registada deste aparelho. O servidor grava-a com
 * crypto_verified = false; esta cópia fica no telemóvel como evidência.
 */
export interface ProvaEvidencia {
  operation_id: string;
  user_id: string;
  device_id: string;
  /** Payload da operação tal como foi enviado (com a assinatura original). */
  payload: unknown;
  /** Porque é que a assinatura não confere. */
  motivo: string;
  criada_em: string;
}

interface LinhaEvidencia extends Omit<ProvaEvidencia, 'payload'> {
  payload_json: string;
}

function deLinha({ payload_json, ...resto }: LinhaEvidencia): ProvaEvidencia {
  return { ...resto, payload: JSON.parse(payload_json) };
}

export function criarRepositorioProvasEvidencia(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    /**
     * Guarda (ou atualiza, se a operação for reenviada) a cópia da prova.
     * A data da primeira gravação mantém-se.
     */
    async guardar(prova: Omit<ProvaEvidencia, 'criada_em'>): Promise<void> {
      await db.run(
        `INSERT INTO provas_evidencia (operation_id, user_id, device_id, payload_json, motivo, criada_em)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (operation_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           motivo = excluded.motivo`,
        [
          prova.operation_id,
          prova.user_id,
          prova.device_id,
          paraJson(prova.payload),
          prova.motivo,
          paraIso(relogio()),
        ],
      );
    },

    async obter(operationId: string): Promise<ProvaEvidencia | null> {
      const linha = await db.getFirst<LinhaEvidencia>(
        'SELECT * FROM provas_evidencia WHERE operation_id = ?',
        [operationId],
      );
      return linha ? deLinha(linha) : null;
    },

    /** Provas do utilizador guardadas como evidência, das mais recentes para as mais antigas. */
    async listarDoUtilizador(userId: string): Promise<ProvaEvidencia[]> {
      const linhas = await db.getAll<LinhaEvidencia>(
        `SELECT * FROM provas_evidencia WHERE user_id = ?
          ORDER BY criada_em DESC, operation_id`,
        [userId],
      );
      return linhas.map(deLinha);
    },
  };
}

export type RepositorioProvasEvidencia = ReturnType<typeof criarRepositorioProvasEvidencia>;
