import { beforeEach, describe, expect, jest, test } from '@jest/globals';

type Erro = { message: string; code?: string } | null;
let mockErroInsert: Erro = null;
let mockErroUpsert: Erro = null;
const mockChamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
jest.mock('@/config/pais', () => ({ obterConfigPais: async () => ({ country_code: 'AO' }) }));

jest.mock('../supabase', () => ({
  supabase: {
    from: (tabela: string) => ({
      insert: async (...args: unknown[]) => {
        mockChamadas.push({ tabela, metodo: 'insert', args });
        return { error: mockErroInsert };
      },
      upsert: async (...args: unknown[]) => {
        mockChamadas.push({ tabela, metodo: 'upsert', args });
        return { error: mockErroUpsert };
      },
    }),
  },
}));

const { criarFavoritoComMorada } = require('../moradas') as typeof import('../moradas');

const NOVO = {
  morada: {
    id: 'm-1',
    latitude: -12.7761,
    longitude: 15.7392,
    precisao: 4,
    plusCode: '5FVQ5PWV+PH5',
    codigoPostal: null,
    visibilidade: 'LIMITED' as const,
  },
  favorito: { id: 'f-1', categoria: 'casa' as const, nome: '  ' },
};

beforeEach(() => {
  mockChamadas.length = 0;
  mockErroInsert = null;
  mockErroUpsert = null;
});

describe('criarFavoritoComMorada', () => {
  test('cria a morada por validar em nome de quem pede e depois o favorito', async () => {
    await criarFavoritoComMorada('u-1', NOVO);
    expect(mockChamadas).toEqual([
      {
        tabela: 'addresses',
        metodo: 'insert',
        args: [
          {
            id: 'm-1',
            latitude: -12.7761,
            longitude: 15.7392,
            location: 'SRID=4326;POINT(15.7392 -12.7761)',
            accuracy_meters: 4,
            plus_code: '5FVQ5PWV+PH5',
            postal_code: null,
            visibility_level: 'LIMITED',
            status: 'PROPOSED',
            source: 'app',
            created_by: 'u-1',
            country_code: 'AO',
          },
        ],
      },
      {
        tabela: 'favorites',
        metodo: 'upsert',
        args: [
          { id: 'f-1', user_id: 'u-1', address_id: 'm-1', category: 'casa', label: null },
          { onConflict: 'user_id,address_id', ignoreDuplicates: true },
        ],
      },
    ]);
  });

  test('envio repetido: a morada já existe (23505) e o favorito é criado na mesma', async () => {
    mockErroInsert = { message: 'duplicate key', code: '23505' };
    await expect(criarFavoritoComMorada('u-1', NOVO)).resolves.toBeUndefined();
    expect(mockChamadas.map((c) => c.tabela)).toEqual(['addresses', 'favorites']);
  });

  test('outros erros sobem em palavras simples e o favorito não é criado', async () => {
    mockErroInsert = { message: 'new row violates row-level security policy', code: '42501' };
    await expect(criarFavoritoComMorada('u-1', NOVO)).rejects.toThrow(/Não foi possível guardar a morada/);
    expect(mockChamadas.map((c) => c.tabela)).toEqual(['addresses']);

    mockErroInsert = null;
    mockErroUpsert = { message: 'x' };
    await expect(criarFavoritoComMorada('u-1', NOVO)).rejects.toThrow(/Não foi possível guardar o favorito/);
  });
});
