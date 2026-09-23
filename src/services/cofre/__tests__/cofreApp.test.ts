import { describe, expect, test } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import { criarCofreApp, OPCOES_COFRE, type CofreNativo } from '../cofreApp';
import { NOME_CHAVE_ASSINATURA, NOME_CHAVE_SESSAO, NOME_ID_DISPOSITIVO } from '../nomes';

/** Imita o Keychain do iOS: cada item guarda a opção de acesso com que foi criado. */
function keychainFalso() {
  const itens = new Map<string, { valor: string; acesso: string | undefined }>();
  const opcoesVistas: (string | undefined)[] = [];
  const nativo: CofreNativo = {
    getItemAsync: async (nome, opcoes) => {
      opcoesVistas.push(opcoes?.keychainAccessible?.toString());
      return itens.get(nome)?.valor ?? null;
    },
    setItemAsync: async (nome, valor, opcoes) => {
      opcoesVistas.push(opcoes?.keychainAccessible?.toString());
      itens.set(nome, { valor, acesso: opcoes?.keychainAccessible?.toString() });
    },
    deleteItemAsync: async (nome, opcoes) => {
      opcoesVistas.push(opcoes?.keychainAccessible?.toString());
      itens.delete(nome);
    },
  };
  return { itens, opcoesVistas, nativo };
}

const THIS_DEVICE_ONLY = String(SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);

describe('cofre com AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY', () => {
  test('as opções pedem AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY (nunca sai do telemóvel)', () => {
    expect(SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY).toBeDefined();
    expect(OPCOES_COFRE.keychainAccessible).toBe(SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    expect(OPCOES_COFRE.keychainAccessible).not.toBe(SecureStore.AFTER_FIRST_UNLOCK);
  });

  test('todos os itens (sessão, device_id, chave de assinatura) são gravados com essa opção', async () => {
    const k = keychainFalso();
    const cofre = criarCofreApp(k.nativo);

    for (const nome of [NOME_CHAVE_SESSAO, NOME_ID_DISPOSITIVO, NOME_CHAVE_ASSINATURA]) {
      await cofre.setItemAsync(nome, `valor de ${nome}`);
      expect(await cofre.getItemAsync(nome)).toBe(`valor de ${nome}`);
      expect(k.itens.get(nome)?.acesso).toBe(THIS_DEVICE_ONLY);
    }
    await cofre.deleteItemAsync(NOME_CHAVE_ASSINATURA);
    expect(k.itens.has(NOME_CHAVE_ASSINATURA)).toBe(false);

    // Cada acesso (ler, gravar, apagar) levou a opção; não se criou mais nenhum item.
    expect(k.opcoesVistas.every((o) => o === THIS_DEVICE_ONLY)).toBe(true);
    expect([...k.itens.keys()].sort()).toEqual([NOME_CHAVE_SESSAO, NOME_ID_DISPOSITIVO].sort());
  });
});
