import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import KvStore from 'expo-sqlite/kv-store';

/** Nome, no expo-secure-store, da chave AES que cifra a sessão. */
export const NOME_CHAVE_SESSAO = 'angola_localiza.chave_sessao';

/** Prefixo do texto cifrado guardado (permite mudar o formato no futuro). */
const VERSAO = 'v1:';
const BYTES_CHAVE = 32; // AES-256
const BYTES_NONCE = 12; // recomendado para AES-GCM

/** O que o expo-secure-store faz (trocável nos testes). */
export interface CofreChaves {
  getItemAsync(nome: string): Promise<string | null>;
  setItemAsync(nome: string, valor: string): Promise<void>;
}

/** O que o expo-sqlite/kv-store faz (trocável nos testes). */
export interface ArmazemTexto {
  getItem(nome: string): Promise<string | null>;
  setItem(nome: string, valor: string): Promise<void>;
  removeItem(nome: string): Promise<void>;
}

export interface DependenciasArmazenamento {
  cofre: CofreChaves;
  armazem: ArmazemTexto;
  bytesAleatorios: (quantos: number) => Uint8Array;
}

/** Forma que o supabase-js pede em `auth.storage`. */
export interface ArmazenamentoSessao {
  getItem(nome: string): Promise<string | null>;
  setItem(nome: string, valor: string): Promise<void>;
  removeItem(nome: string): Promise<void>;
}

/**
 * Adaptador de armazenamento da sessão para o supabase-js.
 *
 * A sessão (tokens + dados do utilizador) pode passar os ~2 KB que o
 * expo-secure-store aceita. Por isso:
 * - uma chave AES-256 aleatória fica no expo-secure-store (Keychain/Keystore);
 * - a sessão fica no expo-sqlite/kv-store, cifrada com AES-GCM.
 * O nome do item entra como "dados associados" (AAD): um texto cifrado
 * copiado para outro nome não é aceite.
 *
 * Se não der para decifrar (chave perdida, dados estragados), apaga o item e
 * devolve null: o utilizador volta a entrar. Nunca devolve nem grava texto simples.
 */
export function criarArmazenamentoSessao(deps: DependenciasArmazenamento): ArmazenamentoSessao {
  let chave: Promise<Uint8Array> | null = null;

  function obterChave(): Promise<Uint8Array> {
    if (!chave) {
      chave = (async () => {
        const guardada = await deps.cofre.getItemAsync(NOME_CHAVE_SESSAO);
        if (guardada && /^[0-9a-f]{64}$/.test(guardada)) return hexToBytes(guardada);
        const nova = deps.bytesAleatorios(BYTES_CHAVE);
        if (!(nova instanceof Uint8Array) || nova.length !== BYTES_CHAVE) {
          throw new Error('Não foi possível gerar a chave da sessão.');
        }
        await deps.cofre.setItemAsync(NOME_CHAVE_SESSAO, bytesToHex(nova));
        return nova;
      })().catch((erro) => {
        chave = null;
        throw erro;
      });
    }
    return chave;
  }

  return {
    async setItem(nome, valor) {
      const k = await obterChave();
      const nonce = deps.bytesAleatorios(BYTES_NONCE);
      const cifrado = gcm(k, nonce, utf8ToBytes(nome)).encrypt(utf8ToBytes(valor));
      await deps.armazem.setItem(nome, VERSAO + bytesToHex(nonce) + bytesToHex(cifrado));
    },

    async getItem(nome) {
      const guardado = await deps.armazem.getItem(nome);
      if (guardado === null) return null;
      try {
        if (!guardado.startsWith(VERSAO)) throw new Error('formato desconhecido');
        const bytes = hexToBytes(guardado.slice(VERSAO.length));
        const nonce = bytes.subarray(0, BYTES_NONCE);
        const cifrado = bytes.subarray(BYTES_NONCE);
        const k = await obterChave();
        return bytesToUtf8(gcm(k, nonce, utf8ToBytes(nome)).decrypt(cifrado));
      } catch {
        await deps.armazem.removeItem(nome);
        return null;
      }
    },

    async removeItem(nome) {
      await deps.armazem.removeItem(nome);
    },
  };
}

/** Adaptador usado pela app (expo-secure-store + expo-sqlite/kv-store). */
export const armazenamentoSessao: ArmazenamentoSessao = criarArmazenamentoSessao({
  cofre: SecureStore,
  armazem: KvStore,
  bytesAleatorios: getRandomBytes,
});
