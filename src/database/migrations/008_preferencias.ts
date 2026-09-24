import type { Migracao } from './tipos';

/**
 * Pequenos valores guardados no telemóvel (chave → valor), para os usar sem
 * rede. Ex.: "cidadao_verificado:<user_id>" = "1" (o servidor só aceita
 * registos de moradas de quem fez a verificação simples da identidade).
 */
export const migracao008: Migracao = {
  versao: 8,
  nome: 'preferencias',
  async aplicar(tx) {
    await tx.exec(`
      CREATE TABLE preferencias (
        chave         TEXT PRIMARY KEY NOT NULL,
        valor         TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );
    `);
  },
};
