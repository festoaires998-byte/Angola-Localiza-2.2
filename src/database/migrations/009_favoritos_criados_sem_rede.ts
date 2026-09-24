import type { Migracao } from './tipos';

/**
 * Favoritos criados no telemóvel (botão "Guardar como favorito" do Mapa),
 * também sem rede: pendente passa a aceitar 'criar' (a morada e o favorito
 * ainda não existem no servidor).
 *
 * O SQLite não deixa mudar um CHECK: a tabela é refeita com os mesmos dados.
 */
export const migracao009: Migracao = {
  versao: 9,
  nome: 'favoritos_criados_sem_rede',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE favoritos_novo (
        id            TEXT PRIMARY KEY NOT NULL,
        morada_id     TEXT NOT NULL,
        nome          TEXT NOT NULL,
        categoria     TEXT NOT NULL DEFAULT 'outro' CHECK (categoria IN
                        ('casa', 'trabalho', 'familia', 'cliente', 'loja', 'entrega', 'outro')),
        atualizado_em TEXT NOT NULL,
        user_id       TEXT,
        pendente      TEXT CHECK (pendente IS NULL OR pendente IN ('criar', 'atualizar', 'remover')),
        criado_em     TEXT
      );
      INSERT INTO favoritos_novo (id, morada_id, nome, categoria, atualizado_em, user_id, pendente, criado_em)
        SELECT id, morada_id, nome, categoria, atualizado_em, user_id, pendente, criado_em FROM favoritos;
      DROP TABLE favoritos;
      ALTER TABLE favoritos_novo RENAME TO favoritos;
      CREATE INDEX idx_favoritos_morada ON favoritos (morada_id);
      CREATE INDEX idx_favoritos_categoria ON favoritos (categoria);
      CREATE INDEX idx_favoritos_utilizador ON favoritos (user_id, criado_em);
    `);
  },
};
