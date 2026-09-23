import type { BaseDados } from '../tipos';
import { deJson, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/** Uma zona descarregada para usar sem rede. */
export interface ZonaOffline {
  id: string;
  latitude: number;
  longitude: number;
  raio_metros: number;
  total_moradas: number;
  /** Resposta do servidor ao preparar a zona (guardada em JSON). */
  resposta: unknown;
  preparado_em: string;
}

interface LinhaZona extends Omit<ZonaOffline, 'resposta'> {
  resposta_json: string | null;
}

function deLinha({ resposta_json, ...resto }: LinhaZona): ZonaOffline {
  return { ...resto, resposta: deJson(resposta_json) };
}

export function criarRepositorioZonaOffline(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    async guardar(
      zona: Omit<ZonaOffline, 'preparado_em'> & { preparado_em?: string },
    ): Promise<void> {
      await db.run(
        `INSERT OR REPLACE INTO zona_offline
           (id, latitude, longitude, raio_metros, total_moradas, resposta_json, preparado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          zona.id,
          zona.latitude,
          zona.longitude,
          zona.raio_metros,
          zona.total_moradas,
          zona.resposta === undefined || zona.resposta === null ? null : paraJson(zona.resposta),
          zona.preparado_em ?? paraIso(relogio()),
        ],
      );
    },

    async obter(id: string): Promise<ZonaOffline | null> {
      const linha = await db.getFirst<LinhaZona>('SELECT * FROM zona_offline WHERE id = ?', [id]);
      return linha ? deLinha(linha) : null;
    },

    async listar(): Promise<ZonaOffline[]> {
      const linhas = await db.getAll<LinhaZona>(
        'SELECT * FROM zona_offline ORDER BY preparado_em DESC',
      );
      return linhas.map(deLinha);
    },

    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM zona_offline WHERE id = ?', [id]);
    },
  };
}

export type RepositorioZonaOffline = ReturnType<typeof criarRepositorioZonaOffline>;
