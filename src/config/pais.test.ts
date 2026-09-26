import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { limparCacheConfigPais, obterConfigPais, paisTemNivel, CONFIG_AO_OFFLINE_TESTE } from './pais';

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
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    limparCacheConfigPais();
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

    await expect(obterConfigPais('MZ')).rejects.toThrow('Não existe uma configuração ativa para o país MZ.');
  });

  it('identifica níveis territoriais configurados', async () => {
    expect(paisTemNivel(CONFIG_AO_OFFLINE_TESTE, 'province')).toBe(true);
    expect(paisTemNivel(CONFIG_AO_OFFLINE_TESTE, 'district')).toBe(false);
  });
});
