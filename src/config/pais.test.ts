import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type CountryConfigRow = {
  country_code: string;
  country_name: string;
  currency_code: string;
  phone_country_code: string;
  address_hierarchy: string[];
  is_active: boolean;
};

type MaybeSingleResult = { data: CountryConfigRow | null; error: { message: string } | null };

const mockMaybeSingle = jest.fn<() => Promise<MaybeSingleResult>>();

jest.mock('@/api/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: mockMaybeSingle,
          })),
        })),
      })),
    })),
  },
}));

describe('configuração de país', () => {
  beforeEach(async () => {
    mockMaybeSingle.mockReset();
    const modulo = await import('./pais');
    modulo.limparCacheConfigPais();
  });

  it('carrega Angola a partir de country_configs', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        country_code: 'AO',
        country_name: 'Angola',
        currency_code: 'AOA',
        phone_country_code: '+244',
        address_hierarchy: ['province', 'municipality', 'neighborhood', 'street', 'block', 'house_number'],
        is_active: true,
      },
      error: null,
    });

    const { obterConfigPais } = await import('./pais');
    await expect(obterConfigPais('AO')).resolves.toMatchObject({
      country_code: 'AO',
      country_name: 'Angola',
      currency_code: 'AOA',
      phone_country_code: '+244',
    });
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('mantém Angola funcional quando o servidor está indisponível', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'offline' },
    });

    const { obterConfigPais } = await import('./pais');
    await expect(obterConfigPais('AO')).resolves.toMatchObject({
      country_code: 'AO',
      country_name: 'Angola',
      address_hierarchy: ['province', 'municipality', 'neighborhood', 'street', 'block', 'house_number'],
    });
  });

  it('não inventa configuração para outro país', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const { obterConfigPais } = await import('./pais');
    await expect(obterConfigPais('MZ')).rejects.toThrow('Não existe uma configuração ativa para o país MZ.');
  });

  it('identifica níveis territoriais configurados', async () => {
    const { CONFIG_AO_OFFLINE_TESTE, paisTemNivel } = await import('./pais');
    expect(paisTemNivel(CONFIG_AO_OFFLINE_TESTE, 'province')).toBe(true);
    expect(paisTemNivel(CONFIG_AO_OFFLINE_TESTE, 'district')).toBe(false);
  });
});
