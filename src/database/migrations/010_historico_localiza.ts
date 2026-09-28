import type { Migracao } from './tipos';

export const migracao010: Migracao = {
  versao: 10,
  nome: 'historico_localiza',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE historico_localiza (
        id TEXT PRIMARY KEY NOT NULL,
        titulo TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        subtitulo TEXT,
        atualizado_em TEXT NOT NULL
      );
      CREATE INDEX idx_historico_localiza_data ON historico_localiza (atualizado_em DESC);
    `);
  },
};
