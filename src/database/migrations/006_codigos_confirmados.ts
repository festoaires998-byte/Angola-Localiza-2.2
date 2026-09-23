import type { Migracao } from './tipos';

/**
 * Último Código Postal Digital confirmado pelo servidor para cada célula
 * (sigla da província + grelha de 8 símbolos, ~38 m × 19 m). Sem rede, a app
 * mostra-o em vez do código provisório, que não sabe o "-N" do servidor.
 */
export const migracao006: Migracao = {
  versao: 6,
  nome: 'codigos_confirmados',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE codigos_confirmados (
        chave         TEXT PRIMARY KEY NOT NULL,
        codigo        TEXT NOT NULL,
        latitude      REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude     REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        confirmado_em TEXT NOT NULL
      );
    `);
  },
};
