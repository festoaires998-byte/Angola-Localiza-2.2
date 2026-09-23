import { distanciaHaversine, quadradoEnvolvente } from '../geo';
import type { BaseDados } from '../tipos';
import { deJson, paraJson } from '../util';

export type OrigemMorada = 'servidor' | 'zona_offline' | 'local';

export interface Morada {
  id: string;
  plus_code: string | null;
  codigo_postal: string | null;
  latitude: number;
  longitude: number;
  precisao_m: number | null;
  provincia: string | null;
  municipio: string | null;
  estado: string | null;
  origem: OrigemMorada;
  /** Resto dos dados da morada, tal como vieram (guardado em JSON). */
  dados: unknown;
  atualizado_em: string;
}

export interface MoradaComDistancia extends Morada {
  distancia_m: number;
}

interface LinhaMorada extends Omit<Morada, 'dados'> {
  dados_json: string | null;
}

function deLinha(linha: LinhaMorada): Morada {
  const { dados_json, ...resto } = linha;
  return { ...resto, dados: deJson(dados_json) };
}

function normalizarPlusCode(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export function criarRepositorioMoradas(db: BaseDados) {
  async function inserirOuAtualizar(tx: BaseDados, m: Morada): Promise<void> {
    await tx.run(
      `INSERT INTO moradas (id, plus_code, codigo_postal, latitude, longitude, precisao_m,
         provincia, municipio, estado, origem, dados_json, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         plus_code = excluded.plus_code,
         codigo_postal = excluded.codigo_postal,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         precisao_m = excluded.precisao_m,
         provincia = excluded.provincia,
         municipio = excluded.municipio,
         estado = excluded.estado,
         origem = excluded.origem,
         dados_json = excluded.dados_json,
         atualizado_em = excluded.atualizado_em`,
      [
        m.id,
        m.plus_code === null ? null : normalizarPlusCode(m.plus_code),
        m.codigo_postal,
        m.latitude,
        m.longitude,
        m.precisao_m,
        m.provincia,
        m.municipio,
        m.estado,
        m.origem,
        m.dados === undefined || m.dados === null ? null : paraJson(m.dados),
        m.atualizado_em,
      ],
    );
  }

  return {
    /** Guarda (ou atualiza) várias moradas de uma vez: ou todas, ou nenhuma. */
    async guardarVarias(moradas: Morada[]): Promise<void> {
      if (moradas.length === 0) return;
      await db.transacao(async (tx) => {
        for (const m of moradas) await inserirOuAtualizar(tx, m);
      });
    },

    guardar(morada: Morada): Promise<void> {
      return inserirOuAtualizar(db, morada);
    },

    async obter(id: string): Promise<Morada | null> {
      const linha = await db.getFirst<LinhaMorada>('SELECT * FROM moradas WHERE id = ?', [id]);
      return linha ? deLinha(linha) : null;
    },

    async procurarPorPlusCode(plusCode: string): Promise<Morada[]> {
      const linhas = await db.getAll<LinhaMorada>(
        'SELECT * FROM moradas WHERE plus_code = ? ORDER BY atualizado_em DESC',
        [normalizarPlusCode(plusCode)],
      );
      return linhas.map(deLinha);
    },

    async procurarPorCodigoPostal(codigoPostal: string): Promise<Morada[]> {
      const linhas = await db.getAll<LinhaMorada>(
        'SELECT * FROM moradas WHERE codigo_postal = ? ORDER BY atualizado_em DESC',
        [codigoPostal.trim()],
      );
      return linhas.map(deLinha);
    },

    /**
     * Moradas a até `raioM` metros do ponto, da mais perto para a mais longe.
     * Primeiro um filtro rápido por quadrado de coordenadas (usa o índice),
     * depois a distância exata (haversine). Serve para detetar duplicados sem rede.
     */
    async procurarPerto(lat: number, lng: number, raioM: number): Promise<MoradaComDistancia[]> {
      if (!(raioM >= 0)) throw new Error('O raio tem de ser um número >= 0.');
      const q = quadradoEnvolvente(lat, lng, raioM);
      // Não tratamos a passagem pelo meridiano de 180° (não acontece em Angola).
      const linhas = await db.getAll<LinhaMorada>(
        `SELECT * FROM moradas
          WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
        [q.latMin, q.latMax, q.lngMin, q.lngMax],
      );
      return linhas
        .map((l) => ({
          ...deLinha(l),
          distancia_m: distanciaHaversine(lat, lng, l.latitude, l.longitude),
        }))
        .filter((m) => m.distancia_m <= raioM)
        .sort((a, b) => a.distancia_m - b.distancia_m);
    },

    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM moradas WHERE id = ?', [id]);
    },

    /** Apaga todas as moradas de uma origem (ex.: ao renovar a zona offline). */
    async apagarPorOrigem(origem: OrigemMorada): Promise<number> {
      const r = await db.run('DELETE FROM moradas WHERE origem = ?', [origem]);
      return r.alteracoes;
    },
  };
}

export type RepositorioMoradas = ReturnType<typeof criarRepositorioMoradas>;
