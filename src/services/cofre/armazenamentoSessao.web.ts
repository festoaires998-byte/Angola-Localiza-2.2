import { Platform } from 'react-native';
import type { ArmazenamentoSessao } from './armazenamentoSessao';

/**
 * Armazenamento Web para a sessão do Supabase.
 * O navegador fornece o isolamento/segurança de origem; a APP nativa continua
 * usando SecureStore + SQLite cifrado.
 */
const chave = 'angola-localiza:supabase-auth';

function disponivel(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export const armazenamentoSessao: ArmazenamentoSessao = {
  async getItem(nome) {
    if (!disponivel()) return null;
    return window.localStorage.getItem(nome === 'supabase.auth.token' ? chave : nome);
  },
  async setItem(nome, valor) {
    if (!disponivel()) return;
    window.localStorage.setItem(nome === 'supabase.auth.token' ? chave : nome, valor);
  },
  async removeItem(nome) {
    if (!disponivel()) return;
    window.localStorage.removeItem(nome === 'supabase.auth.token' ? chave : nome);
  },
};
