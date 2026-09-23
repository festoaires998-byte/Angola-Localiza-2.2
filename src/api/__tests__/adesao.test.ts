import { describe, expect, test } from '@jest/globals';

import { criarAdesao, NOME_TOKEN_ADESAO, type CofreAdesao } from '../adesao';

function cofre(): CofreAdesao & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItemAsync: async (n) => dados.get(n) ?? null,
    setItemAsync: async (n, v) => {
      dados.set(n, v);
    },
    deleteItemAsync: async (n) => {
      dados.delete(n);
    },
  };
}

function erroHttp(estado: number, mensagem = 'erro') {
  return Object.assign(new Error(mensagem), { estado });
}

describe('link de adesão', () => {
  test('sem token não chama o servidor', async () => {
    let chamadas = 0;
    const a = criarAdesao(cofre(), async () => {
      chamadas++;
      return { ok: true, role: 'estafeta' };
    });
    expect(await a.consumir()).toEqual({ estado: 'sem_token' });
    expect(chamadas).toBe(0);
  });

  test('envia o token e apaga-o quando corre bem', async () => {
    const c = cofre();
    const enviados: string[] = [];
    const a = criarAdesao(c, async (token) => {
      enviados.push(token);
      return { ok: true, role: 'tecnico_campo', requires_mfa: true };
    });
    await a.guardar('  abc123  ');
    expect(await a.consumir()).toEqual({ estado: 'aderiu', cargo: 'tecnico_campo' });
    expect(enviados).toEqual(['abc123']);
    expect(c.dados.has(NOME_TOKEN_ADESAO)).toBe(false);
  });

  test.each([
    [404, 'link_invalido', false],
    [410, 'link_invalido', false],
    [403, 'link_invalido', false],
    [401, 'tentar_mais_tarde', true],
    [429, 'tentar_mais_tarde', true],
    [500, 'tentar_mais_tarde', true],
    [0, 'tentar_mais_tarde', true],
  ])('erro %i → %s (token fica guardado: %s)', async (estado, esperado, fica) => {
    const c = cofre();
    const a = criarAdesao(c, async () => {
      throw erroHttp(estado, 'LINK_DEAD: link expirado');
    });
    await a.guardar('abc');
    expect((await a.consumir()).estado).toBe(esperado);
    expect(c.dados.has(NOME_TOKEN_ADESAO)).toBe(fica);
  });

  test('não aceita token vazio', async () => {
    await expect(criarAdesao(cofre(), async () => ({ ok: true, role: 'x' })).guardar('  ')).rejects.toThrow();
  });
});
