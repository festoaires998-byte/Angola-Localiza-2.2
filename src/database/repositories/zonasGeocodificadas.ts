import { distanciaHaversine, quadradoEnvolvente } from '../geo';
import type { BaseDados } from '../tipos';
import { deJson, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/** Última resposta do servidor para uma zona (Plus Code de 8 dígitos). */
export interface ZonaGeocodificada {
  zona: string;
  latitude: number;
  longitude: number;
  provincia: string | null;
  municipio: string | null;
  resposta: unknown;
  atualizado_em: string;
}

interface LinhaZona extends Omit<ZonaGeocodificada, 'resposta'> {
  resposta_json: string | null;
}

function deLinha({ resposta_json, ...resto }: LinhaZona): ZonaGeocodificada {
  return { ...resto, resposta: deJson(resposta_json) };
}

export function criarRepositorioZonasGeocodificadas(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    /** Guarda (ou substitui) a resposta da zona. */
    async guardar(zona: Omit<ZonaGeocodificada, 'atualizado_em'>): Promise<ZonaGeocodificada> {
      const atualizado_em = paraIso(relogio());
      await db.run(
        `INSERT OR REPLACE INTO zonas_geocodificadas
           (zona, latitude, longitude, provincia, municipio, resposta_json, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          zona.zona,
          zona.latitude,
          zona.longitude,
          zona.provincia,
          zona.municipio,
          zona.resposta === undefined || zona.resposta === null ? null : paraJson(zona.resposta),
          atualizado_em,
        ],
      );
      return { ...zona, atualizado_em };
    },

    async obter(zona: string): Promise<ZonaGeocodificada | null> {
      const linha = await db.getFirst<LinhaZona>('SELECT * FROM zonas_geocodificadas WHERE zona = ?', [zona]);
      return linha ? deLinha(linha) : null;
    },

    /** A zona guardada mais perto do ponto, até `raioM` metros; null se não houver. */
    async maisProxima(latitude: number, longitude: number, raioM: number): Promise<ZonaGeocodificada | null> {
      const q = quadradoEnvolvente(latitude, longitude, raioM);
      const linhas = await db.getAll<LinhaZona>(
        `SELECT * FROM zonas_geocodificadas
          WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
        [q.latMin, q.latMax, q.lngMin, q.lngMax],
      );
      let melhor: LinhaZona | null = null;
      let melhorD = Infinity;
      for (const l of linhas) {
        const d = distanciaHaversine(latitude, longitude, l.latitude, l.longitude);
        if (d <= raioM && d < melhorD) {
          melhor = l;
          melhorD = d;
        }
      }
      return melhor ? deLinha(melhor) : null;
    },
  };
}

export type RepositorioZonasGeocodificadas = ReturnType<typeof criarRepositorioZonasGeocodificadas>;
