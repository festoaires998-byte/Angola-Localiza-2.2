import { describe, expect, test } from '@jest/globals';
import { randomBytes } from 'crypto';

import {
  criarArmazenamentoSessao,
  NOME_CHAVE_SESSAO,
  type ArmazemTexto,
  type CofreChaves,
} from '../armazenamentoSessao';
import { criarObterIdDispositivo, NOME_ID_DISPOSITIVO } from '../idDispositivo';

function cofreEmMemoria(): CofreChaves & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItemAsync: async (n) => dados.get(n) ?? null,
    setItemAsync: async (n, v) => {
      dados.set(n, v);
    },
  };
}

function armazemEmMemoria(): ArmazemTexto & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: async (n) => dados.get(n) ?? null,
    setItem: async (n, v) => {
      dados.set(n, v);
    },
    removeItem: async (n) => {
      dados.delete(n);
    },
  };
}

const bytes = (n: number) => new Uint8Array(randomBytes(n));

// Uma sessão maior do que os ~2 KB do expo-secure-store.
const SESSAO = JSON.stringify({
  access_token: 'eyJ' + 'a'.repeat(1500),
  refresh_token: 'r'.repeat(40),
  user: { id: 'u1', email: 'ana@exemplo.ao', user_metadata: { nome: 'Ana' }, extra: 'x'.repeat(1500) },
});

describe('armazenamentoSessao', () => {
  test('guarda cifrado e devolve o original', async () => {
    const cofre = cofreEmMemoria();
    const armazem = armazemEmMemoria();
    const a = criarArmazenamentoSessao({ cofre, armazem, bytesAleatorios: bytes });

    await a.setItem('sb-teste-auth-token', SESSAO);

    const guardado = armazem.dados.get('sb-teste-auth-token')!;
    expect(guardado.startsWith('v1:')).toBe(true);
    expect(guardado).not.toContain('access_token');
    expect(guardado).not.toContain('ana@exemplo.ao');
    // A chave (32 bytes em hex) fica no cofre, não no armazém.
    expect(cofre.dados.get(NOME_CHAVE_SESSAO)).toMatch(/^[0-9a-f]{64}$/);
    expect([...armazem.dados.values()].join('')).not.toContain(cofre.dados.get(NOME_CHAVE_SESSAO));

    expect(await a.getItem('sb-teste-auth-token')).toBe(SESSAO);
  });

  test('cada gravação usa um nonce novo', async () => {
    const armazem = armazemEmMemoria();
    const a = criarArmazenamentoSessao({ cofre: cofreEmMemoria(), armazem, bytesAleatorios: bytes });
    await a.setItem('k', 'igual');
    const primeiro = armazem.dados.get('k');
    await a.setItem('k', 'igual');
    expect(armazem.dados.get('k')).not.toBe(primeiro);
  });

  test('a chave é criada uma vez e reaproveitada por uma nova instância', async () => {
    const cofre = cofreEmMemoria();
    const armazem = armazemEmMemoria();
    await criarArmazenamentoSessao({ cofre, armazem, bytesAleatorios: bytes }).setItem('k', 'olá');
    const chave = cofre.dados.get(NOME_CHAVE_SESSAO);

    const outra = criarArmazenamentoSessao({ cofre, armazem, bytesAleatorios: bytes });
    expect(await outra.getItem('k')).toBe('olá');
    expect(cofre.dados.get(NOME_CHAVE_SESSAO)).toBe(chave);
  });

  test('sem a chave certa não decifra: apaga e devolve null', async () => {
    const armazem = armazemEmMemoria();
    await criarArmazenamentoSessao({ cofre: cofreEmMemoria(), armazem, bytesAleatorios: bytes }).setItem('k', SESSAO);

    const outroTelemovel = criarArmazenamentoSessao({ cofre: cofreEmMemoria(), armazem, bytesAleatorios: bytes });
    expect(await outroTelemovel.getItem('k')).toBeNull();
    expect(armazem.dados.has('k')).toBe(false);
  });

  test.each([
    ['texto simples antigo', SESSAO],
    ['estragado', 'v1:zz'],
    ['cortado', 'v1:00'],
  ])('valor %s não é devolvido', async (_nome, valor) => {
    const armazem = armazemEmMemoria();
    const a = criarArmazenamentoSessao({ cofre: cofreEmMemoria(), armazem, bytesAleatorios: bytes });
    armazem.dados.set('k', valor);
    expect(await a.getItem('k')).toBeNull();
    expect(armazem.dados.has('k')).toBe(false);
  });

  test('um texto cifrado copiado para outro nome não é aceite', async () => {
    const armazem = armazemEmMemoria();
    const a = criarArmazenamentoSessao({ cofre: cofreEmMemoria(), armazem, bytesAleatorios: bytes });
    await a.setItem('original', 'segredo');
    armazem.dados.set('copia', armazem.dados.get('original')!);
    expect(await a.getItem('copia')).toBeNull();
  });

  test('removeItem apaga e getItem de algo que não existe dá null', async () => {
    const armazem = armazemEmMemoria();
    const a = criarArmazenamentoSessao({ cofre: cofreEmMemoria(), armazem, bytesAleatorios: bytes });
    await a.setItem('k', 'x');
    await a.removeItem('k');
    expect(await a.getItem('k')).toBeNull();
  });

  test('pedidos em paralelo criam uma só chave', async () => {
    const cofre = cofreEmMemoria();
    let geradas = 0;
    const a = criarArmazenamentoSessao({
      cofre,
      armazem: armazemEmMemoria(),
      bytesAleatorios: (n) => {
        if (n === 32) geradas++;
        return bytes(n);
      },
    });
    await Promise.all([a.setItem('a', '1'), a.setItem('b', '2'), a.setItem('c', '3')]);
    expect(geradas).toBe(1);
    expect(await a.getItem('b')).toBe('2');
  });
});

describe('idDispositivo', () => {
  const UUID = '3b0c8e2a-1f4d-4c2b-9a7e-5d6f7a8b9c0d';

  test('cria "app-" + UUID uma vez e depois devolve sempre o mesmo', async () => {
    const cofre = cofreEmMemoria();
    let chamadas = 0;
    const obter = criarObterIdDispositivo(cofre, () => {
      chamadas++;
      return UUID;
    });
    const [a, b] = await Promise.all([obter(), obter()]);
    expect(a).toBe(`app-${UUID}`);
    expect(b).toBe(a);
    expect(chamadas).toBe(1);
    expect(cofre.dados.get(NOME_ID_DISPOSITIVO)).toBe(a);

    // Nova abertura da app: lê o guardado, não gera outro.
    const depois = criarObterIdDispositivo(cofre, () => 'nao-devia-ser-usado');
    expect(await depois()).toBe(a);
  });

  test('um valor guardado com formato errado é substituído', async () => {
    const cofre = cofreEmMemoria();
    cofre.dados.set(NOME_ID_DISPOSITIVO, 'lixo');
    expect(await criarObterIdDispositivo(cofre, () => UUID)()).toBe(`app-${UUID}`);
  });
});
