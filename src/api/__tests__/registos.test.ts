import { beforeEach, describe, expect, jest, test } from '@jest/globals';

type Resposta = { data: unknown; error: { message: string } | null };
let mockRegistos: Resposta = { data: [], error: null };
let mockMoradas: Resposta = { data: [], error: null };
const mockUpsert = jest.fn(async (_linha: unknown, _o: unknown): Promise<{ error: { message: string } | null }> => ({ error: null }));
const mockChamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
jest.mock('../supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const registar = (metodo: string) => (...args: unknown[]) => {
        mockChamadas.push({ tabela, metodo, args });
        return q;
      };
      q.select = registar('select');
      q.eq = registar('eq');
      q.order = registar('order');
      q.limit = async (...args: unknown[]) => {
        mockChamadas.push({ tabela, metodo: 'limit', args });
        return mockRegistos;
      };
      q.in = async (...args: unknown[]) => {
        mockChamadas.push({ tabela, metodo: 'in', args });
        return mockMoradas;
      };
      q.upsert = (linha: unknown, o: unknown) => mockUpsert(linha, o);
      return q;
    },
  },
}));

const { juntarAosFavoritos, lerMeusRegistos } = require('../registos') as typeof import('../registos');

beforeEach(() => {
  mockChamadas.length = 0;
  mockUpsert.mockClear();
  mockRegistos = { data: [], error: null };
  mockMoradas = { data: [], error: null };
});

describe('api/registos', () => {
  test('lê só os registos da pessoa e, para os aprovados, o código postal e o número', async () => {
    mockRegistos = {
      data: [
        { id: 'r1', status: 'APPROVED', reference: '[Casa] Portão', resulting_address_id: 'm1' },
        { id: 'r2', status: 'PENDING_REVIEW', reference: '[Casa] Outro', resulting_address_id: null },
      ],
      error: null,
    };
    mockMoradas = { data: [{ id: 'm1', postal_code: 'AO-1', house_number: '7' }], error: null };
    const r = await lerMeusRegistos('u1');
    expect(mockChamadas.find((c) => c.tabela === 'field_records' && c.metodo === 'eq')?.args).toEqual(['collected_by', 'u1']);
    expect(mockChamadas.find((c) => c.tabela === 'addresses' && c.metodo === 'in')?.args).toEqual(['id', ['m1']]);
    expect(r[0]).toMatchObject({ estado: 'aprovado', codigoPostal: 'AO-1', numeroPorta: '7' });
    expect(r[1]).toMatchObject({ estado: 'por_validar', codigoPostal: null });
  });

  test('sem aprovados não pede moradas; erro do servidor em palavras simples', async () => {
    mockRegistos = { data: [{ id: 'r2', status: 'PENDING_REVIEW' }], error: null };
    await lerMeusRegistos('u1');
    expect(mockChamadas.some((c) => c.tabela === 'addresses')).toBe(false);
    mockRegistos = { data: null, error: { message: 'x' } };
    await expect(lerMeusRegistos('u1')).rejects.toThrow('Não foi possível ler os teus registos (x).');
  });

  test('juntar aos favoritos: da própria pessoa, sem duplicar', async () => {
    await juntarAosFavoritos('u1', 'm1', 'casa', 'Casa');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', address_id: 'm1', category: 'casa', label: 'Casa' },
      { onConflict: 'user_id,address_id', ignoreDuplicates: true },
    );
    mockUpsert.mockResolvedValueOnce({ error: { message: 'y' } });
    await expect(juntarAosFavoritos('u1', 'm1', 'casa', null)).rejects.toThrow('Não foi possível guardar a morada aprovada (y).');
  });
});
