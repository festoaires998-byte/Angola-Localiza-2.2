/**
 * Código Postal Digital calculado no telemóvel, sem rede.
 *
 * Réplica EXATA das contas da Edge Function `generate-postal-code` (versão 2,
 * SCHEME_VERSION 1). Formato: AO-{PROV}-{GRID8}[-{N}]-{CHK}
 * - PROV: 3 primeiras letras do nome da província, em maiúsculas ("XXX" se não se sabe);
 * - GRID8: 8 caracteres de uma grelha tipo geohash (~38 m × 19 m);
 * - N: só o servidor sabe (aparece quando já há outra morada na mesma célula);
 * - CHK: 2 dígitos de controlo sobre "PROV-GRID8".
 *
 * Por isso o código feito aqui é sempre "provisório": sem o N, e confirmado
 * pelo servidor quando houver rede. Se a função do servidor mudar, este
 * ficheiro e o teste de paridade têm de mudar com ela.
 */

export const ALFABETO_GRELHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const COMPRIMENTO_GRELHA = 8;
export const VERSAO_ESQUEMA = 1;

/** Grelha: alterna bits de longitude e latitude, 5 bits por caractere. */
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
    // Com 5 bits o valor vai até 31 e o alfabeto tem 31 letras: o 31 dá
    // undefined no servidor (fica "undefined" no texto). Replicamos igual.
    codigo += ALFABETO_GRELHA[parseInt(bits.substring(i, i + 5).padEnd(5, '0'), 2)];
  }
  return codigo;
}

export function digitosControlo(texto: string): string {
  let soma = 0;
  for (let i = 0; i < texto.length; i++) {
    const idx = ALFABETO_GRELHA.indexOf(texto[i]);
    const valor = idx >= 0 ? idx + 1 : texto.charCodeAt(i);
    soma = (soma + valor * (i + 1)) % 9973;
  }
  return ((soma % 97) + 1).toString().padStart(2, '0');
}

export function siglaProvincia(nomeProvincia: string | null | undefined): string {
  return nomeProvincia ? nomeProvincia.substring(0, 3).toUpperCase() : 'XXX';
}

export interface CodigoPostalProvisorio {
  /** Ex.: AO-HUA-KPQ7M2XA-41 (sem o "-N" que só o servidor sabe). */
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
