import { supabase } from '@/api/supabase';

export type CodigoPais = string;
export interface NivelTerritorial { level_key: string; label: string; plural_label: string; level_order: number; is_locality: boolean; }
export interface ConfigPais {
  country_code: CodigoPais; country_name: string; native_name: string; locale: string;
  currency_code: string; currency_symbol: string; phone_country_code: string;
  address_hierarchy: string[]; territorial_levels: NivelTerritorial[]; is_active: boolean;
}
export const PAIS_PADRAO: CodigoPais = 'AO';
/** Países PALOP suportados pelo registo multipaís. */
export const PAISES_PALOP = ['AO', 'MZ', 'CV', 'GW', 'ST'] as const;

export function nomeDaMarca(config: Pick<ConfigPais, 'country_name'>): string {
  return `${config.country_name} Localiza`;
}

const NOMES_PAISES: Record<string, string> = { AO: 'Angola', MZ: 'Moçambique', CV: 'Cabo Verde', GW: 'Guiné-Bissau', ST: 'São Tomé e Príncipe' };
const BANDEIRAS: Record<string, string> = { AO: '🇦🇴', MZ: '🇲🇿', CV: '🇨🇻', GW: '🇬🇼', ST: '🇸🇹' };

/** Nome do país (ex.: "Moçambique"); um código desconhecido fica como está. */
export function nomeDoPais(countryCode: CodigoPais): string {
  const codigo = countryCode.trim().toUpperCase();
  return NOMES_PAISES[codigo] ?? codigo;
}

/** Bandeira e nome (ex.: "🇲🇿 Moçambique"). */
export function paisComBandeira(countryCode: CodigoPais): string {
  const codigo = countryCode.trim().toUpperCase();
  return BANDEIRAS[codigo] ? `${BANDEIRAS[codigo]} ${nomeDoPais(codigo)}` : nomeDoPais(codigo);
}

export function nomeDaMarcaPorCodigo(countryCode: CodigoPais): string {
  return `${nomeDoPais(countryCode)} Localiza`;
}
const CONFIG_AO_OFFLINE: ConfigPais = {
  country_code: 'AO', country_name: 'Angola', native_name: 'Angola', locale: 'pt-AO',
  currency_code: 'AOA', currency_symbol: 'Kz', phone_country_code: '+244',
  address_hierarchy: ['province', 'municipality', 'commune', 'neighborhood'],
  territorial_levels: [
    { level_key: 'province', label: 'Província', plural_label: 'Províncias', level_order: 1, is_locality: false },
    { level_key: 'municipality', label: 'Município', plural_label: 'Municípios', level_order: 2, is_locality: false },
    { level_key: 'commune', label: 'Comuna', plural_label: 'Comunas', level_order: 3, is_locality: false },
    { level_key: 'neighborhood', label: 'Bairro', plural_label: 'Bairros', level_order: 4, is_locality: true },
  ], is_active: true,
};
let cache: ConfigPais | null = null;
const pedidos = new Map<CodigoPais, Promise<ConfigPais>>();
const texto = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;
function normalizarNiveis(v: unknown): NivelTerritorial[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => {
    const x = (item ?? {}) as Record<string, unknown>;
    const key = texto(x.level_key), label = texto(x.label), plural = texto(x.plural_label), order = Number(x.level_order);
    if (!key || !label || !plural || !Number.isFinite(order) || order <= 0) return null;
    return { level_key: key, label, plural_label: plural, level_order: order, is_locality: x.is_locality === true };
  }).filter((x): x is NivelTerritorial => x !== null).sort((a, b) => a.level_order - b.level_order);
}
function normalizarConfig(country: unknown, levels: unknown): ConfigPais | null {
  const c = (country ?? {}) as Record<string, unknown>;
  const code = texto(c.country_code), name = texto(c.name), nativeName = texto(c.native_name), locale = texto(c.locale);
  const currency = texto(c.currency_code), symbol = texto(c.currency_symbol), phone = texto(c.phone_country_code);
  const territorialLevels = normalizarNiveis(levels);
  if (!code || !name || !nativeName || !locale || !currency || !symbol || !phone || territorialLevels.length === 0) return null;
  return { country_code: code.toUpperCase(), country_name: name, native_name: nativeName, locale, currency_code: currency.toUpperCase(), currency_symbol: symbol, phone_country_code: phone, address_hierarchy: territorialLevels.map((x) => x.level_key), territorial_levels: territorialLevels, is_active: c.enabled === true };
}
async function carregarConfigPais(countryCode: CodigoPais): Promise<ConfigPais> {
  const codigo = countryCode.trim().toUpperCase() || PAIS_PADRAO;
  const { data: country, error: countryError } = await supabase.from('country_configs').select('country_code,name,native_name,locale,currency_code,currency_symbol,phone_country_code,enabled').eq('country_code', codigo).eq('enabled', true).maybeSingle();
  if (!countryError && country) {
    const { data: levels, error: levelsError } = await supabase.from('country_territorial_levels').select('level_key,label,plural_label,level_order,is_locality').eq('country_code', codigo).order('level_order', { ascending: true });
    const config = !levelsError ? normalizarConfig(country, levels) : null;
    if (config) return config;
  }
  if (codigo === PAIS_PADRAO) return CONFIG_AO_OFFLINE;
  throw new Error(countryError?.message ? ('Não foi possível carregar a configuração do país ' + codigo + ' (' + countryError.message + ').') : ('Não existe uma configuração ativa para o país ' + codigo + '.'));
}
export function obterConfigPais(countryCode: CodigoPais = PAIS_PADRAO): Promise<ConfigPais> {
  const codigo = countryCode.trim().toUpperCase() || PAIS_PADRAO;
  if (cache?.country_code === codigo) return Promise.resolve(cache);
  const existente = pedidos.get(codigo);
  if (existente) return existente;
  const pedido = carregarConfigPais(codigo).then((config) => { cache = config; return config; }).finally(() => { pedidos.delete(codigo); });
  pedidos.set(codigo, pedido);
  return pedido;
}
export function inicializarConfigPais(countryCode: CodigoPais = PAIS_PADRAO): Promise<ConfigPais> { return obterConfigPais(countryCode); }
export function limparCacheConfigPais(): void { cache = null; }
export function paisTemNivel(config: ConfigPais, nivel: string): boolean { return config.address_hierarchy.includes(nivel); }
export function nivelLocalidade(config: ConfigPais): NivelTerritorial | null {
  return config.territorial_levels.find((nivel) => nivel.is_locality) ?? null;
}
export function nivelPorChave(config: ConfigPais, chave: string): NivelTerritorial | null {
  return config.territorial_levels.find((nivel) => nivel.level_key === chave) ?? null;
}
export const CONFIG_AO_OFFLINE_TESTE = CONFIG_AO_OFFLINE;