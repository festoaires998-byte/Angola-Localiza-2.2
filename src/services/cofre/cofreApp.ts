import * as SecureStore from 'expo-secure-store';

import type { CofreChaves } from './armazenamentoSessao';

/**
 * Opções usadas em TODOS os acessos ao expo-secure-store.
 *
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY (iOS):
 * - o item pode ser lido com o ecrã bloqueado, desde que o telemóvel tenha sido
 *   desbloqueado uma vez depois de ligar (é o que permite sincronizar em segundo plano);
 * - o item nunca sai deste telemóvel: não vai para backups do iCloud/iTunes nem
 *   passa para um telemóvel novo.
 *
 * No Android esta opção é ignorada: o Keystore já funciona com o ecrã bloqueado,
 * e os dados do expo-secure-store ficam fora do backup automático (plugin do
 * expo-secure-store com configureAndroidBackup, no app.json).
 */
export const OPCOES_COFRE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** O que o expo-secure-store faz, com opções (trocável nos testes). */
export interface CofreNativo {
  getItemAsync(nome: string, opcoes?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(nome: string, valor: string, opcoes?: SecureStore.SecureStoreOptions): Promise<void>;
  deleteItemAsync(nome: string, opcoes?: SecureStore.SecureStoreOptions): Promise<void>;
}

/** Cofre da app: ler, gravar e apagar, sempre com OPCOES_COFRE. */
export interface CofreApp extends CofreChaves {
  deleteItemAsync(nome: string): Promise<void>;
}

/** Cofre que passa sempre OPCOES_COFRE ao expo-secure-store. */
export function criarCofreApp(nativo: CofreNativo): CofreApp {
  return {
    getItemAsync: (nome) => nativo.getItemAsync(nome, OPCOES_COFRE),
    setItemAsync: (nome, valor) => nativo.setItemAsync(nome, valor, OPCOES_COFRE),
    deleteItemAsync: (nome) => nativo.deleteItemAsync(nome, OPCOES_COFRE),
  };
}

export const cofreApp: CofreApp = criarCofreApp(SecureStore);
