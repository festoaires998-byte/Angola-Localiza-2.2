import type { BaseDados } from '../tipos';
import { deJson, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

export type EstadoLevantamento = 'rascunho' | 'na_fila' | 'enviado' | 'aprovado' | 'rejeitado';

/** Um levantamento de campo (morada recolhida por um agente). */
export interface Levantamento {
  id: string;
  estado: EstadoLevantamento;
  latitude: number | null;
  longitude: number | null;
  plus_code: string | null;
  precisao_m: number | null;
  justificacao_precisao: string | null;
  bairro_id: string | null;
  rua_id: string | null;
  referencia: string | null;
  porta_intercalada_entre: string | null;
  operation_id: string | null;
  /** Resto do formulário (guardado em JSON). */
  dados: unknown;
  criado_em: string;
  atualizado_em: string;
}

export type LevantamentoParaGuardar = Omit<Levantamento, 'criado_em' | 'atualizado_em'> & {
  criado_em?: string;
  atualizado_em?: string;
};

interface LinhaLevantamento extends Omit<Levantamento, 'dados'> {
  dados_json: string | null;
}

function deLinha({ dados_json, ...resto }: LinhaLevantamento): Levantamento {
  return { ...resto, dados: deJson(dados_json) };
}

export function criarRepositorioLevantamentos(
  db: BaseDados,
  relogio: Relogio = relogioDoSistema,
) {
  return {
    /** Cria ou atualiza. Ao atualizar, mantém o criado_em original. */
    async guardar(l: LevantamentoParaGuardar): Promise<void> {
      const agora = paraIso(relogio());
      await db.run(
        `INSERT INTO levantamentos (id, estado, latitude, longitude, plus_code, precisao_m,
           justificacao_precisao, bairro_id, rua_id, referencia, porta_intercalada_entre,
           operation_id, dados_json, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           estado = excluded.estado,
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           plus_code = excluded.plus_code,
           precisao_m = excluded.precisao_m,
           justificacao_precisao = excluded.justificacao_precisao,
           bairro_id = excluded.bairro_id,
           rua_id = excluded.rua_id,
           referencia = excluded.referencia,
           porta_intercalada_entre = excluded.porta_intercalada_entre,
           operation_id = excluded.operation_id,
           dados_json = excluded.dados_json,
           atualizado_em = excluded.atualizado_em`,
        [
          l.id,
          l.estado,
          l.latitude,
          l.longitude,
          l.plus_code,
          l.precisao_m,
          l.justificacao_precisao,
          l.bairro_id,
          l.rua_id,
          l.referencia,
          l.porta_intercalada_entre,
          l.operation_id,
          l.dados === undefined || l.dados === null ? null : paraJson(l.dados),
          l.criado_em ?? agora,
          l.atualizado_em ?? agora,
        ],
      );
    },

    async obter(id: string): Promise<Levantamento | null> {
      const linha = await db.getFirst<LinhaLevantamento>(
        'SELECT * FROM levantamentos WHERE id = ?',
        [id],
      );
      return linha ? deLinha(linha) : null;
    },

    async listarPorEstado(estado: EstadoLevantamento): Promise<Levantamento[]> {
      const linhas = await db.getAll<LinhaLevantamento>(
        'SELECT * FROM levantamentos WHERE estado = ? ORDER BY atualizado_em DESC',
        [estado],
      );
      return linhas.map(deLinha);
    },

    async listar(): Promise<Levantamento[]> {
      const linhas = await db.getAll<LinhaLevantamento>(
        'SELECT * FROM levantamentos ORDER BY atualizado_em DESC',
      );
      return linhas.map(deLinha);
    },

    async mudarEstado(id: string, estado: EstadoLevantamento): Promise<void> {
      await db.run('UPDATE levantamentos SET estado = ?, atualizado_em = ? WHERE id = ?', [
        estado,
        paraIso(relogio()),
        id,
      ]);
    },

    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM levantamentos WHERE id = ?', [id]);
    },
  };
}

export type RepositorioLevantamentos = ReturnType<typeof criarRepositorioLevantamentos>;
