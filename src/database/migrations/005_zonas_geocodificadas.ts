import type { Migracao } from './tipos';

/**
 * Província e município sem rede: a última resposta do servidor (Edge
 * Function geocode, action reverse) para cada zona, guardada no telemóvel.
 * A zona é o Plus Code de 8 dígitos (~275 m × 275 m).
 */
export const migracao005: Migracao = {
  versao: 5,
  nome: 'zonas_geocodificadas',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE zonas_geocodificadas (
        zona          TEXT PRIMARY KEY NOT NULL,
        latitude      REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude     REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        provincia     TEXT,
        municipio     TEXT,
        resposta_json TEXT CHECK (resposta_json IS NULL OR json_valid(resposta_json)),
        atualizado_em TEXT NOT NULL
      );
      CREATE INDEX idx_zonas_geocodificadas_coordenadas ON zonas_geocodificadas (latitude, longitude);
    `);
  },
};
