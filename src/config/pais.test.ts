import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { limparCacheConfigPais, obterConfigPais, paisTemNivel, CONFIG_AO_OFFLINE_TESTE } from './pais';

type CountryConfigRow = { country_code: string; name: string; native_name: string; locale: string; currency_code: string; currency_symbol: string; phone_country_code: string; enabled: boolean; };
type LevelRow = { level_key: string; label: string; plural_label: string; level_order: number; is_locality: boolean };
type MaybeSingleResult = { data: CountryConfigRow | null; error: { message: string } | null };

const mockMaybeSingle = jest.fn<() => Promise<MaybeSingleResult>>();
const mockLevels = jest.fn<() => Promise<{ data: LevelRow[] | null; error: { message: string } | null }>>();

jest.mock('@/api/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => table === 'country_configs'
      ? { select: jest.fn(() => ({ eq: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })) })) })) }
      : { select: jest.fn(() => ({ eq: jest.fn(() => ({ order: jest.fn(() => mockLevels()) })) })) }),
  },
}));

describe('configuração de país', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockLevels.mockReset();
    limparCacheConfigPais();
  });

  it('carrega Angola a partir de country_configs', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        country_code: 'AO',
        name: 'Angola', native_name: 'Angola', locale: 'pt-AO', currency_code: 'AOA', currency_symbol: 'Kz', phone_country_code: '+244', enabled: true,
      },
      error: null,
    });
    mockLevels.mockResolvedValue({ data: [
      { level_key: 'province', label: 'Província', plural_label: 'Províncias', level_order: 1, is_locality: false },
      { level_key: 'municipality', label: 'Município', plural_label: 'Municípios', level_order: 2, is_locality: false },
      { level_key: 'commune', label: 'Comuna', plural_label: 'Comunas', level_order: 3, is_locality: false },
      { level_key: 'neighborhood', label: 'Bairro', plural_label: 'Bairros', level_order: 4, is_locality: true },
    ], error: null });

    await expect(obterConfigPais('AO')).resolves.toMatchObject({
      country_code: 'AO',
      country_name: 'Angola',
      currency_code: 'AOA',
      phone_country_code: '+244',
    });
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('mantém Angola funcional quando o servidor está indisponível', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });

    await expect(obterConfigPais('AO')).resolves.toMatchObject({
      country_code: 'AO',
      country_name: 'Angola',
      address_hierarchy: ['province', 'municipality', 'neighborhood', 'street', 'block', 'house_number'],
    });
  });

  it('não inventa configuração para outro país', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(obterConfigPais('MZ')).rejects.toThrow('Não existe uma configuração ativa para o país MZ.');
  });

  it('identifica níveis territoriais configurados', async () => {
    expect(paisTemNivel(CONFIG_AO_OFFLINE_TESTE, 'province')).toBe(true);
    expect(paisTemNivel(CONFIG_AO_OFFLINE_TESTE, 'district')).toBe(false);
  });
});
