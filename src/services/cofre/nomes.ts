/** Nomes dos itens guardados no expo-secure-store. */

/** Chave AES que cifra a sessão. */
export const NOME_CHAVE_SESSAO = 'angola_localiza.chave_sessao';

/** Identificador deste aparelho. */
export const NOME_ID_DISPOSITIVO = 'angola_localiza.id_dispositivo';

/** Marca que a migração para AFTER_FIRST_UNLOCK já foi feita. */
export const NOME_ACESSO_COFRE = 'angola_localiza.cofre_acesso';

/** Itens que a app guarda no cofre (os que a migração tem de mudar). */
export const NOMES_NO_COFRE = [NOME_CHAVE_SESSAO, NOME_ID_DISPOSITIVO] as const;
