/**
 * Código Postal Digital calculado no telemóvel, sem rede.
 *
 * Mesmas contas da Edge Function `generate-postal-code`, esquema 2
 * (supabase/functions/generate-postal-code/codigoPostal.ts). Formato:
 * AO-{PROV}-{GRID8}[-{N}]-{CHK}
 * - PROV: 3 primeiras letras do nome da província, em maiúsculas ("XXX" se não se sabe);
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

export const SIGLA_DESCONHECIDA = 'XXX';

/**
 * Sigla da província: as 3 primeiras letras do nome, em maiúsculas; "XXX" se
 * o nome não veio. Igual ao servidor.
 */
export function siglaProvincia(nomeProvincia: string | null | undefined): string {
  return nomeProvincia ? nomeProvincia.substring(0, 3).toUpperCase() : SIGLA_DESCONHECIDA;
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

/** Retângulo (em graus) da célula da grelha onde o ponto cai: as mesmas divisões de `codificarGrelha`. */
export function limitesCelula(
  latitude: number,
  longitude: number,
  comprimento = COMPRIMENTO_GRELHA,
): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let eLng = true;
  for (let i = 0; i < comprimento * 5; i++) {
    if (eLng) {
      const meio = (lngMin + lngMax) / 2;
      if (longitude >= meio) lngMin = meio;
      else lngMax = meio;
    } else {
      const meio = (latMin + latMax) / 2;
      if (latitude >= meio) latMin = meio;
      else latMax = meio;
    }
    eLng = !eLng;
  }
  return { latMin, latMax, lngMin, lngMax };
}

/**
 * Distância (m) do ponto ao lado mais próximo da sua célula (~38 m × 19 m).
 * Perto de 0: o ponto está na fronteira entre duas células e, com o erro do
 * GPS, o código pode alternar entre o desta célula e o da vizinha.
 */
export function distanciaAoLimiteCelula(latitude: number, longitude: number): number {
  const c = limitesCelula(latitude, longitude);
  const mPorGrauLat = 110_574;
  const mPorGrauLng = 111_320 * Math.cos((latitude * Math.PI) / 180);
  return Math.min(
    (latitude - c.latMin) * mPorGrauLat,
    (c.latMax - latitude) * mPorGrauLat,
    (longitude - c.lngMin) * mPorGrauLng,
    (c.lngMax - longitude) * mPorGrauLng,
  );
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
  countryCode = 'AO',
): CodigoPostalProvisorio {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Coordenada inválida: latitude e longitude têm de ser números.');
  }
  const sigla = siglaProvincia(nomeProvincia);
  const grelha = codificarGrelha(latitude, longitude);
  const controlo = digitosControlo(`${sigla}-${grelha}`);
  return { codigo: `${countryCode.trim().toUpperCase()}-${sigla}-${grelha}-${controlo}`, sigla, grelha, controlo };
}

export function codigoBase(latitude: number, longitude: number, provinceName?: string | null, countryCode = 'AO') {
  const sigla = siglaProvincia(provinceName); const grelha = codificarGrelha(latitude, longitude); const checksum = digitosControlo(sigla + '-' + grelha);
  return { base: sigla + '-' + grelha, postal_code: countryCode.trim().toUpperCase() + '-' + sigla + '-' + grelha + '-' + checksum, checksum };
}
export function validatePostalCode(code: string): { valid: boolean; reason?: string } {
  const match = code.trim().match(/^([A-Z]{2})-([A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{3})-([2-9A-HJ-NP-ZL]{8})(?:-(\d+))?-(\d{2})$/);
  if (!match) return { valid: false, reason: 'Formato inválido.' }; const [, , provinceCode, gridCode, , chk] = match;
  const expected = digitosControlo(provinceCode + '-' + gridCode); return expected === chk ? { valid: true } : { valid: false, reason: 'Dígito de controlo inválido.' };
}
