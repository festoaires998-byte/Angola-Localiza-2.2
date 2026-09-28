import { describe, expect, jest, test } from '@jest/globals';

const mockSignUp = jest.fn();

jest.mock('../api/supabase', () => ({
  supabase: {
    auth: {
      signUp: (args: unknown) => mockSignUp(args),
    },
  },
}));

jest.mock('@/services/cofre/cofreApp', () => ({ cofreApp: {} }));
jest.mock('../adesao', () => ({ criarAdesao: () => ({ guardar: jest.fn(), consumir: jest.fn(async () => ({ status: 'nenhum' })) }) }));
jest.mock('../edge/chamarFuncao', () => ({ chamarFuncao: jest.fn() }));

const { criarConta } = require('../api/auth') as typeof import('../api/auth');

describe('registo multipaís', () => {
  test.each([
    ['AO', 'Angola'],
    ['MZ', 'Moçambique'],
    ['CV', 'Cabo Verde'],
    ['GW', 'Guiné-Bissau'],
    ['ST', 'São Tomé e Príncipe'],
  ])('envia country_code %s para o Supabase', async (countryCode) => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: 'u-1' }, session: null },
      error: null,
    });

    const resultado = await criarConta(' pessoa@example.com ', '123456', 'Pessoa Teste', undefined, countryCode as never);

    expect(resultado).toEqual({ userId: 'u-1', precisaConfirmar: true });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'pessoa@example.com',
      password: '123456',
      options: {
        data: { full_name: 'Pessoa Teste', country_code: countryCode },
      },
    });
  });
});
