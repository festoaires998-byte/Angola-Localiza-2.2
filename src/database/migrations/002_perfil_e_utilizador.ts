import type { Migracao } from './tipos';

/**
 * Sessão por utilizador:
 * - perfil_local: último perfil (cargos + KYC) confirmado pelo servidor, por utilizador.
 *   É o que se usa quando não há rede ("falhar fechado").
 * - fila_saida.user_id: de quem é cada operação. As que já existiam ficam com
 *   user_id NULL e não são enviadas automaticamente (não sabemos de quem são).
 */
export const migracao002: Migracao = {
  versao: 2,
  nome: 'perfil_e_utilizador',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE perfil_local (
        user_id       TEXT PRIMARY KEY NOT NULL,
        email         TEXT,
        cargos_json   TEXT NOT NULL DEFAULT '[]'
                        CHECK (json_valid(cargos_json) AND json_type(cargos_json) = 'array'),
        estado_kyc    TEXT,
        confirmado_em TEXT NOT NULL
      );

      ALTER TABLE fila_saida ADD COLUMN user_id TEXT;
      CREATE INDEX idx_fila_saida_utilizador
        ON fila_saida (user_id, estado, proxima_tentativa_em, criado_em);
    `);
  },
};
