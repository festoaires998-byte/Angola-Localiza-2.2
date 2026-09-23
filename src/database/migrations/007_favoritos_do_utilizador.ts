import type { Migracao } from './tipos';

/**
 * Favoritos (separador Moradas) ligados ao utilizador e com alterações feitas
 * sem rede:
 * - user_id: de quem é (no mesmo telemóvel pode entrar outra pessoa);
 * - pendente: 'atualizar' (mudou o nome/categoria) ou 'remover' (tirado dos
 *   favoritos), à espera de rede para ir para o servidor; NULL = igual ao servidor;
 * - criado_em: quando foi guardado (a lista mostra os mais recentes primeiro).
 * Só se acrescentam colunas (ALTER TABLE ADD COLUMN não mexe nos dados).
 */
export const migracao007: Migracao = {
  versao: 7,
  nome: 'favoritos_do_utilizador',
  async aplicar(tx) {
    await tx.exec(`
      ALTER TABLE favoritos ADD COLUMN user_id TEXT;
      ALTER TABLE favoritos ADD COLUMN pendente TEXT
        CHECK (pendente IS NULL OR pendente IN ('atualizar', 'remover'));
      ALTER TABLE favoritos ADD COLUMN criado_em TEXT;
      CREATE INDEX idx_favoritos_utilizador ON favoritos (user_id, criado_em);
    `);
  },
};
