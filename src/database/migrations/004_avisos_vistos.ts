import type { Migracao } from './tipos';

/**
 * "Já vi" nos avisos das Definições: a prova guardada como evidência ganha a
 * data em que o utilizador a marcou como vista. A linha NUNCA é apagada (é
 * evidência); só deixa de aparecer na lista de avisos.
 */
export const migracao004: Migracao = {
  versao: 4,
  nome: 'avisos_vistos',
  async aplicar(tx) {
    await tx.exec(`ALTER TABLE provas_evidencia ADD COLUMN visto_em TEXT;`);
  },
};
