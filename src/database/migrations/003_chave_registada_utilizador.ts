import type { Migracao } from './tipos';

/**
 * O servidor guarda a chave pública por (utilizador, aparelho). Se outra pessoa
 * entrar no mesmo telemóvel, a chave tem de ser registada de novo para ela.
 * registada_user_id diz para que utilizador a chave foi registada. As chaves
 * que já estavam registadas ficam com NULL e voltam a ser registadas (o registo
 * no servidor pode repetir-se sem problema).
 */
export const migracao003: Migracao = {
  versao: 3,
  nome: 'chave_registada_utilizador',
  async aplicar(tx) {
    await tx.exec('ALTER TABLE chaves_dispositivo ADD COLUMN registada_user_id TEXT;');
  },
};
