/**
 * Código Postal Digital calculado no telemóvel, sem rede.
 *
 * Mesmas contas da Edge Function `generate-postal-code`, esquema 2
 * (supabase/functions/generate-postal-code/codigoPostal.ts). Formato:
 * AO-{PROV}-{GRID8}[-{N}]-{CHK}
 * - PROV: sigla FIXA da província (ISO 3166-2:AO onde existe; "XXX" se não se sabe);
 * - GRID8: 8 símbolos de uma grelha tipo geohash (~38 m × 19 m);
 * - N: só o servidor sabe (aparece quando já há outra morada na mesma célula);
 * - CHK: 2 dígitos de controlo sobre "PROV-GRID8".
 *
 * Por isso o código feito aqui é sempre "provisório": sem o N, e confirmado
 * pelo servidor quando houver rede. O teste codigoPostal.test.ts compara estas
 * contas com as do servidor; se a função mudar, este ficheiro muda com ela.
 */

export const VERSAO_ESQUEMA = 2;
export const COMPRIMENTO_GRELHA = 8;

/** Alfabeto do esquema 1 (31 símbolos, sem I, L, O, 0, 1): só para o controlo. */
export const ALFABETO_CONTROLO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Alfabeto da grelha: o do esquema 1 + "L" no fim (32 símbolos = 5 bits, nunca "undefined"). */
export const ALFABETO_GRELHA = `${ALFABETO_CONTROLO}L`;

/** Siglas das 21 províncias (divisão de 2024). As 4 novas não têm código ISO. */
export const SIGLAS_PROVINCIAS: Readonly<Record<string, string>> = {
  bengo: 'BGO',
  benguela: 'BGU',
  bie: 'BIE',
  cabinda: 'CAB',
  cuando: 'CDO',
  cubango: 'CUB',
  'cuanza norte': 'CNO',
  'cuanza sul': 'CUS',
  cunene: 'CNN',
  huambo: 'HUA',
  huila: 'HUI',
  'icolo e bengo': 'ICB',
  luanda: 'LUA',
  'lunda norte': 'LNO',
  'lunda sul': 'LSU',
  malanje: 'MAL',
  moxico: 'MOX',
  'moxico leste': 'MXL',
  namibe: 'NAM',
  uige: 'UIG',
  zaire: 'ZAI',
};

const SINONIMOS: Readonly<Record<string, string>> = {
  'kwanza norte': 'cuanza norte',
  'kwanza sul': 'cuanza sul',
  'kuando kubango': 'cuando cubango',
  kuando: 'cuando',
  kubango: 'cubango',
  malange: 'malanje',
  'moxico este': 'moxico leste',
};

/** Província antiga (antes de 2024) que o mapa ainda pode devolver: código ISO antigo. */
export const SIGLA_CUANDO_CUBANGO = 'CCU';
export const SIGLA_DESCONHECIDA = 'XXX';

/** "Província do Uíge" → "uige"; "Cuanza-Norte" → "cuanza norte". */
export function normalizarProvincia(nome: string): string {
  let n = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  n = n.replace(/^provincia (de |do |da )?/, '');
  return SINONIMOS[n] ?? n;
}

export function siglaProvincia(nomeProvincia: string | null | undefined): string {
  if (!nomeProvincia || !nomeProvincia.trim()) return SIGLA_DESCONHECIDA;
  const n = normalizarProvincia(nomeProvincia);
  if (n === 'cuando cubango') return SIGLA_CUANDO_CUBANGO;
  return SIGLAS_PROVINCIAS[n] ?? SIGLA_DESCONHECIDA;
}

/** Grelha: alterna bits de longitude e latitude, 5 bits por símbolo. */
export function codificarGrelha(latitude: number, longitude: number, comprimento = COMPRIMENTO_GRELHA): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let bits = '';
  let eLng = true;
  for (let i = 0; i < comprimento * 5; i++) {
    if (eLng) {
      const meio = (lngMin + lngMax) / 2;
      if (longitude >= meio) {
        bits += '1';
        lngMin = meio;
      } else {
        bits += '0';
        lngMax = meio;
      }
    } else {
      const meio = (latMin + latMax) / 2;
      if (latitude >= meio) {
        bits += '1';
        latMin = meio;
      } else {
        bits += '0';
        latMax = meio;
      }
    }
    eLng = !eLng;
  }
  let codigo = '';
  for (let i = 0; i < bits.length; i += 5) {
    codigo += ALFABETO_GRELHA[parseInt(bits.substring(i, i + 5).padEnd(5, '0'), 2)];
  }
  return codigo;
}

export function digitosControlo(texto: string): string {
  let soma = 0;
  for (let i = 0; i < texto.length; i++) {
    const idx = ALFABETO_CONTROLO.indexOf(texto[i]);
    const valor = idx >= 0 ? idx + 1 : texto.charCodeAt(i);
    soma = (soma + valor * (i + 1)) % 9973;
  }
  return ((soma % 97) + 1).toString().padStart(2, '0');
}

export interface CodigoPostalProvisorio {
  /** Ex.: AO-HUA-MNFQR6JW-41 (sem o "-N" que só o servidor sabe). */
  codigo: string;
  sigla: string;
  grelha: string;
  controlo: string;
}

/** O código que o servidor daria se ainda não houvesse nenhuma morada na mesma célula. */
export function codigoPostalProvisorio(
  latitude: number,
  longitude: number,
  nomeProvincia?: string | null,
): CodigoPostalProvisorio {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Coordenada inválida: latitude e longitude têm de ser números.');
  }
  const sigla = siglaProvincia(nomeProvincia);
  const grelha = codificarGrelha(latitude, longitude);
  const controlo = digitosControlo(`${sigla}-${grelha}`);
  return { codigo: `AO-${sigla}-${grelha}-${controlo}`, sigla, grelha, controlo };
}
