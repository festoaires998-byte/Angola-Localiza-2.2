import type { BaseDados } from '../tipos';
import { deJson, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

export const TIPOS_REFERENCIA = [
  'provincia',
  'municipio',
  'comuna',
  'bairro',
  'rua',
  'quadra',
] as const;
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

/** Um elemento das listas de referência (província, município, ...). */
export interface Referencia {
  tipo: TipoReferencia;
  id: string;
  /** id do "pai" (ex.: o município de um bairro). null nas províncias. */
  pai_id: string | null;
  nome: string;
  dados: unknown;
  atualizado_em: string;
}

type ReferenciaParaGuardar = Omit<Referencia, 'atualizado_em'> & { atualizado_em?: string };

interface LinhaReferencia extends Omit<Referencia, 'dados'> {
  dados_json: string | null;
}

function deLinha({ dados_json, ...resto }: LinhaReferencia): Referencia {
  return { ...resto, dados: deJson(dados_json) };
}

export function criarRepositorioReferencias(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    /** Guarda (ou atualiza) várias referências de uma vez: ou todas, ou nenhuma. */
    async guardarVarias(referencias: ReferenciaParaGuardar[]): Promise<void> {
      if (referencias.length === 0) return;
      await db.transacao(async (tx) => {
        const agora = paraIso(relogio());
        for (const r of referencias) {
          await tx.run(
            `INSERT OR REPLACE INTO referencias (tipo, id, pai_id, nome, dados_json, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              r.tipo,
              r.id,
              r.pai_id,
              r.nome,
              r.dados === undefined || r.dados === null ? null : paraJson(r.dados),
              r.atualizado_em ?? agora,
            ],
          );
        }
      });
    },

    async obter(tipo: TipoReferencia, id: string): Promise<Referencia | null> {
      const linha = await db.getFirst<LinhaReferencia>(
        'SELECT * FROM referencias WHERE tipo = ? AND id = ?',
        [tipo, id],
      );
      return linha ? deLinha(linha) : null;
    },

    /**
     * Lista por tipo, por nome. Se `paiId` vier, só os filhos desse pai
     * (ex.: os bairros de um município).
     */
    async listar(tipo: TipoReferencia, paiId?: string | null): Promise<Referencia[]> {
      const linhas =
        paiId === undefined
          ? await db.getAll<LinhaReferencia>(
              'SELECT * FROM referencias WHERE tipo = ? ORDER BY nome COLLATE NOCASE',
              [tipo],
            )
          : await db.getAll<LinhaReferencia>(
              `SELECT * FROM referencias WHERE tipo = ? AND pai_id IS ?
                ORDER BY nome COLLATE NOCASE`,
              [tipo, paiId],
            );
      return linhas.map(deLinha);
    },

    async apagar(tipo: TipoReferencia, id: string): Promise<void> {
      await db.run('DELETE FROM referencias WHERE tipo = ? AND id = ?', [tipo, id]);
    },
  };
}

export type RepositorioReferencias = ReturnType<typeof criarRepositorioReferencias>;
