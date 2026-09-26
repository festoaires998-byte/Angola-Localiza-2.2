import { supabase } from '@/api/supabase';

export type CodigoPais = string;

export interface ConfigPais {
  country_code: CodigoPais;
  country_name: string;
  currency_code: string;
  phone_country_code: string;
  address_hierarchy: string[];
  is_active: boolean;
}

export const PAIS_PADRAO: CodigoPais = 'AO';

const CONFIG_AO_OFFLINE: ConfigPais = {
  country_code: 'AO',
  country_name: 'Angola',
  currency_code: 'AOA',
  phone_country_code: '+244',
  address_hierarchy: ['province', 'municipality', 'neighborhood', 'street', 'block', 'house_number'],
  is_active: true,
};

let cache: ConfigPais | null = null;
let pedido: Promise<ConfigPais> | null = null;

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function normalizarHierarquia(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map(texto).filter((v): v is string => v !== null))];
}

function normalizarLinha(valor: unknown): ConfigPais | null {
  const v = (valor ?? {}) as Record<string, unknown>;
  const countryCode = texto(v.country_code);
  const countryName = texto(v.country_name);
  const currencyCode = texto(v.currency_code);
  const phoneCountryCode = texto(v.phone_country_code);
  const hierarchy = normalizarHierarquia(v.address_hierarchy);

  if (!countryCode || !countryName || !currencyCode || !phoneCountryCode || hierarchy.length === 0) {
    return null;
  }

  return {
    country_code: countryCode.toUpperCase(),
    country_name: countryName,
    currency_code: currencyCode.toUpperCase(),
    phone_country_code: phoneCountryCode,
    address_hierarchy: hierarchy,
    is_active: v.is_active === true,
  };
}

async function carregarConfigPais(countryCode: CodigoPais): Promise<ConfigPais> {
  const codigo = countryCode.trim().toUpperCase() || PAIS_PADRAO;
  const { data, error } = await supabase
    .from('country_configs')
    .select('country_code,country_name,currency_code,phone_country_code,address_hierarchy,is_active')
    .eq('country_code', codigo)
    .eq('is_active', true)
    .maybeSingle();

  if (!error) {
    const config = normalizarLinha(data);
    if (config) return config;
  }

  // O núcleo continua funcional offline para o país atual da app.
  // Países adicionais devem existir no country_configs antes de serem usados.
  if (codigo === PAIS_PADRAO) return CONFIG_AO_OFFLINE;

  throw new Error(
    error?.message
      ? `Não foi possível carregar a configuração do país ${codigo} (${error.message}).`
      : `Não existe uma configuração ativa para o país ${codigo}.`,
  );
}

/** Obtém a configuração ativa do país. A primeira leitura vem do Supabase; depois fica em memória. */
export function obterConfigPais(countryCode: CodigoPais = PAIS_PADRAO): Promise<ConfigPais> {
  const codigo = countryCode.trim().toUpperCase() || PAIS_PADRAO;
  if (cache?.country_code === codigo) return Promise.resolve(cache);
  if (pedido) return pedido;

  pedido = carregarConfigPais(codigo)
    .then((config) => {
      cache = config;
      return config;
    })
    .finally(() => {
      pedido = null;
    });

  return pedido;
}

/** Pré-carrega a configuração durante o arranque sem bloquear a navegação. */
export function inicializarConfigPais(countryCode: CodigoPais = PAIS_PADRAO): Promise<ConfigPais> {
  return obterConfigPais(countryCode);
}

/** Limpa o cache em testes ou quando o país ativo for alterado no futuro. */
export function limparCacheConfigPais(): void {
  cache = null;
  pedido = null;
}

/** Verifica se um nível territorial faz parte da configuração ativa. */
export function paisTemNivel(config: ConfigPais, nivel: string): boolean {
  return config.address_hierarchy.includes(nivel);
}

/** Configuração offline exposta apenas para testes e para validação do fallback. */
export const CONFIG_AO_OFFLINE_TESTE = CONFIG_AO_OFFLINE;
