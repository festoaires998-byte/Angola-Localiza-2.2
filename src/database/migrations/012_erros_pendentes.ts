import type { Migracao } from './tipos';

/**
 * Erros da app à espera de ir para o servidor (tabela app_errors).
 * Ficam no telemóvel para sobreviver a um fecho da app; são poucos (no máximo
 * 50) e curtos, para gastar poucos dados.
 */
export const migracao012: Migracao = {
  versao: 12,
  nome: 'erros_pendentes',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE erros_pendentes (
        id          TEXT PRIMARY KEY NOT NULL,
        mensagem    TEXT NOT NULL CHECK (length(mensagem) BETWEEN 1 AND 500),
        pilha       TEXT CHECK (pilha IS NULL OR length(pilha) <= 4000),
        fatal       INTEGER NOT NULL DEFAULT 0 CHECK (fatal IN (0, 1)),
        ecra        TEXT CHECK (ecra IS NULL OR length(ecra) <= 200),
        ocorreu_em  TEXT NOT NULL
      );
      CREATE INDEX idx_erros_pendentes_data ON erros_pendentes (ocorreu_em);
    `);
  },
};
