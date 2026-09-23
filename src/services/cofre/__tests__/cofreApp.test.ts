import { describe, expect, test } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import { criarCofreApp, migrarAcessoCofre, OPCOES_COFRE, type CofreNativo } from '../cofreApp';
import { NOME_ACESSO_COFRE, NOME_CHAVE_SESSAO, NOME_ID_DISPOSITIVO } from '../nomes';

type Acesso = string | undefined;

/**
 * Imita o Keychain do iOS: cada item guarda a opção de acesso com que foi
 * CRIADO; gravar por cima de um item existente só muda o valor.
 */
function keychainFalso() {
  const itens = new Map<string, { valor: string; acesso: Acesso }>();
  let falharGravacaoDe: string | null = null;
  const nativo: CofreNativo = {
    getItemAsync: async (nome) => itens.get(nome)?.valor ?? null,
    setItemAsync: async (nome, valor, opcoes) => {
      if (nome === falharGravacaoDe) throw new Error('errSecInteractionNotAllowed');
      const existente = itens.get(nome);
      if (existente) existente.valor = valor;
      else itens.set(nome, { valor, acesso: opcoes?.keychainAccessible?.toString() });
    },
    deleteItemAsync: async (nome) => {
      itens.delete(nome);
    },
  };
  return {
    itens,
    nativo,
    falharGravacao(nome: string | null) {
      falharGravacaoDe = nome;
    },
  };
}

const AFU = String(SecureStore.AFTER_FIRST_UNLOCK);

describe('cofre com AFTER_FIRST_UNLOCK', () => {
  test('as opções pedem AFTER_FIRST_UNLOCK', () => {
    expect(SecureStore.AFTER_FIRST_UNLOCK).toBeDefined();
    expect(OPCOES_COFRE.keychainAccessible).toBe(SecureStore.AFTER_FIRST_UNLOCK);
  });

  test('a migração muda a opção de acesso dos itens antigos sem mudar os valores', async () => {
    const k = keychainFalso();
    // Guardados por uma versão antiga da app, sem opções (WHEN_UNLOCKED).
    await k.nativo.setItemAsync(NOME_CHAVE_SESSAO, 'a'.repeat(64));
    await k.nativo.setItemAsync(NOME_ID_DISPOSITIVO, 'app-123');

    await migrarAcessoCofre(k.nativo);

    expect(k.itens.get(NOME_CHAVE_SESSAO)).toEqual({ valor: 'a'.repeat(64), acesso: AFU });
    expect(k.itens.get(NOME_ID_DISPOSITIVO)).toEqual({ valor: 'app-123', acesso: AFU });
    expect(k.itens.get(NOME_ACESSO_COFRE)?.valor).toBe('after_first_unlock');
    expect([...k.itens.keys()].some((n) => n.endsWith('.copia'))).toBe(false);
  });

  test('só migra uma vez', async () => {
    const k = keychainFalso();
    await k.nativo.setItemAsync(NOME_ID_DISPOSITIVO, 'app-123');
    await migrarAcessoCofre(k.nativo);
    const apagados: string[] = [];
    const espiao: CofreNativo = {
      ...k.nativo,
      deleteItemAsync: async (n) => {
        apagados.push(n);
      },
    };
    await migrarAcessoCofre(espiao);
    expect(apagados).toEqual([]);
  });

  test('se falhar a meio, nada se perde e a migração seguinte termina o trabalho', async () => {
    const k = keychainFalso();
    await k.nativo.setItemAsync(NOME_ID_DISPOSITIVO, 'app-123');
    k.falharGravacao(NOME_ID_DISPOSITIVO); // apaga o original e falha ao regravar

    await expect(migrarAcessoCofre(k.nativo)).rejects.toThrow();
    expect(k.itens.has(NOME_ID_DISPOSITIVO)).toBe(false);
    expect(k.itens.get(`${NOME_ID_DISPOSITIVO}.copia`)?.valor).toBe('app-123');

    // Mesmo assim a app continua a ler o valor certo (a partir da cópia).
    const cofre = criarCofreApp(k.nativo, true);
    expect(await cofre.getItemAsync(NOME_ID_DISPOSITIVO)).toBe('app-123');

    k.falharGravacao(null);
    await migrarAcessoCofre(k.nativo);
    expect(k.itens.get(NOME_ID_DISPOSITIVO)).toEqual({ valor: 'app-123', acesso: AFU });
    expect(k.itens.has(`${NOME_ID_DISPOSITIVO}.copia`)).toBe(false);
  });

  test('o cofre da app migra antes do primeiro acesso e grava itens novos com AFTER_FIRST_UNLOCK', async () => {
    const k = keychainFalso();
    await k.nativo.setItemAsync(NOME_CHAVE_SESSAO, 'b'.repeat(64));
    const cofre = criarCofreApp(k.nativo, true);

    expect(await cofre.getItemAsync(NOME_CHAVE_SESSAO)).toBe('b'.repeat(64));
    expect(k.itens.get(NOME_CHAVE_SESSAO)?.acesso).toBe(AFU);

    await cofre.setItemAsync('novo', 'x');
    expect(k.itens.get('novo')?.acesso).toBe(AFU);
  });

  test('sem migração (Android) não apaga nem regrava nada', async () => {
    const k = keychainFalso();
    await k.nativo.setItemAsync(NOME_CHAVE_SESSAO, 'c'.repeat(64));
    const cofre = criarCofreApp(k.nativo, false);
    expect(await cofre.getItemAsync(NOME_CHAVE_SESSAO)).toBe('c'.repeat(64));
    expect(k.itens.get(NOME_CHAVE_SESSAO)?.acesso).toBeUndefined();
    expect(k.itens.has(NOME_ACESSO_COFRE)).toBe(false);
  });
});
