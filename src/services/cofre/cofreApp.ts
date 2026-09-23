import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { CofreChaves } from './armazenamentoSessao';
import { NOME_ACESSO_COFRE, NOMES_NO_COFRE } from './nomes';

/**
 * Opções usadas em TODOS os acessos ao expo-secure-store.
 *
 * AFTER_FIRST_UNLOCK (iOS): o item pode ser lido com o ecrã bloqueado, desde
 * que o telemóvel tenha sido desbloqueado uma vez depois de ligar. É o que
 * permite à sincronização em segundo plano ler a sessão. No Android esta
 * opção é ignorada (o Keystore já funciona com o ecrã bloqueado).
 */
export const OPCOES_COFRE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const VALOR_MIGRADO = 'after_first_unlock';

/** O que o expo-secure-store faz, com opções (trocável nos testes). */
export interface CofreNativo {
  getItemAsync(nome: string, opcoes?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(nome: string, valor: string, opcoes?: SecureStore.SecureStoreOptions): Promise<void>;
  deleteItemAsync(nome: string, opcoes?: SecureStore.SecureStoreOptions): Promise<void>;
}

const nomeCopia = (nome: string) => `${nome}.copia`;

/**
 * Muda os itens já guardados para AFTER_FIRST_UNLOCK.
 *
 * No iOS, gravar por cima de um item existente só muda o valor, não a opção de
 * acesso: é preciso apagar e gravar de novo. Para nunca perder a chave da
 * sessão nem o identificador do aparelho, primeiro grava-se uma cópia; se a
 * app fechar a meio, a próxima migração recupera a partir da cópia.
 */
export async function migrarAcessoCofre(
  nativo: CofreNativo,
  nomes: readonly string[] = NOMES_NO_COFRE,
): Promise<void> {
  if ((await nativo.getItemAsync(NOME_ACESSO_COFRE, OPCOES_COFRE)) === VALOR_MIGRADO) return;
  for (const nome of nomes) {
    const copia = nomeCopia(nome);
    const valor =
      (await nativo.getItemAsync(nome, OPCOES_COFRE)) ??
      (await nativo.getItemAsync(copia, OPCOES_COFRE));
    if (valor === null) continue;

    await nativo.deleteItemAsync(copia, OPCOES_COFRE);
    await nativo.setItemAsync(copia, valor, OPCOES_COFRE);
    if ((await nativo.getItemAsync(copia, OPCOES_COFRE)) !== valor) {
      throw new Error(`Não foi possível copiar ${nome} no cofre.`);
    }

    await nativo.deleteItemAsync(nome, OPCOES_COFRE);
    await nativo.setItemAsync(nome, valor, OPCOES_COFRE);
    if ((await nativo.getItemAsync(nome, OPCOES_COFRE)) !== valor) {
      throw new Error(`Não foi possível regravar ${nome} no cofre.`);
    }
    await nativo.deleteItemAsync(copia, OPCOES_COFRE);
  }
  await nativo.setItemAsync(NOME_ACESSO_COFRE, VALOR_MIGRADO, OPCOES_COFRE);
}

/**
 * Cofre usado pela app: passa sempre OPCOES_COFRE e, antes do primeiro
 * acesso, faz a migração (se `migrar` for true). Se a migração falhar
 * (ex.: telemóvel bloqueado), o acesso continua e ela é tentada de novo depois.
 */
export function criarCofreApp(nativo: CofreNativo, migrar: boolean): CofreChaves {
  let migracao: Promise<void> | null = migrar ? null : Promise.resolve();

  function garantirMigracao(): Promise<void> {
    if (!migracao) {
      migracao = migrarAcessoCofre(nativo).catch(() => {
        migracao = null;
      });
    }
    return migracao;
  }

  return {
    async getItemAsync(nome) {
      await garantirMigracao();
      // Se uma migração ficou a meio, o valor pode estar só na cópia.
      return (
        (await nativo.getItemAsync(nome, OPCOES_COFRE)) ??
        (migrar ? await nativo.getItemAsync(nomeCopia(nome), OPCOES_COFRE) : null)
      );
    },
    async setItemAsync(nome, valor) {
      await garantirMigracao();
      await nativo.setItemAsync(nome, valor, OPCOES_COFRE);
    },
  };
}

/** Só o iOS guarda a opção de acesso em cada item. */
export const cofreApp: CofreChaves = criarCofreApp(SecureStore, Platform.OS === 'ios');
