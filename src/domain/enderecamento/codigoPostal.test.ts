import { describe, expect, test } from '@jest/globals';

import * as servidor from '../../../supabase/functions/generate-postal-code/codigoPostal';

import {
  ALFABETO_GRELHA,
  codificarGrelha,
  codigoPostalProvisorio,
  digitosControlo,
  siglaProvincia,
} from './codigoPostal';

// ─── Esquema 1: copiado TAL COMO ESTAVA na Edge Function (versão 2, SCHEME_VERSION 1) ───
// Serve para provar que os códigos antigos que eram válidos não mudam.
const ALFABETO_1 = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function encodeGrid1(lat: number, lng: number, length: number): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, bits = '';
  let isLng = true;
  for (let i = 0; i < length * 5; i++) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { bits += '1'; lngMin = mid; } else { bits += '0'; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { bits += '1'; latMin = mid; } else { bits += '0'; latMax = mid; }
    }
    isLng = !isLng;
  }
  let code = '';
  for (let i = 0; i < bits.length; i += 5) code += ALFABETO_1[parseInt(bits.substring(i, i + 5).padEnd(5, '0'), 2)];
  return code;
}
function checksum1(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const idx = ALFABETO_1.indexOf(input[i]);
    const val = idx >= 0 ? idx + 1 : input.charCodeAt(i);
    sum = (sum + val * (i + 1)) % 9973;
  }
  return (((sum % 97) + 1)).toString().padStart(2, '0');
}
// ─────────────────────────────────────────────────────────────────────────────

/** Gerador pseudo-aleatório fixo (os testes dão sempre o mesmo resultado). */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const NOMES = [
  'Huambo', 'Luanda', 'Bié', 'Uíge', 'Cuanza Norte', 'Cuanza Sul', 'Lunda Norte', 'Lunda Sul',
  'Ícolo e Bengo', 'Moxico Leste', 'Cuando', 'Cubango', 'Cuando Cubango', 'Província do Huambo', 'Atlântida', null,
];

describe('Código Postal Digital: app igual ao servidor (esquema 2)', () => {
  test('dá o mesmo que a função do servidor em 5000 pontos de Angola', () => {
    const r = aleatorio(42);
    for (let i = 0; i < 5000; i++) {
      const lat = -18 + r() * 13.6; // Angola: ~-18.0 a -4.4
      const lng = 11.6 + r() * 12.5; // ~11.6 a 24.1
      const prov = NOMES[i % NOMES.length];
      expect(codigoPostalProvisorio(lat, lng, prov).codigo).toBe(servidor.codigoBase(lat, lng, prov).postal_code);
    }
  });

  test('mesmo alfabeto e mesmas siglas', () => {
    expect(ALFABETO_GRELHA).toBe(servidor.ALFABETO_GRELHA);
    for (const nome of NOMES) expect(siglaProvincia(nome)).toBe(servidor.siglaProvincia(nome));
  });

  test('nunca aparece "undefined" e os códigos do Huambo passam no validate do servidor', () => {
    const r = aleatorio(7);
    for (let i = 0; i < 20000; i++) {
      const c = codigoPostalProvisorio(-13.1 + r() * 0.7, 15.4 + r() * 0.7, 'Huambo').codigo;
      expect(c).not.toContain('undefined');
      expect(servidor.validatePostalCode(c)).toEqual({ valid: true });
    }
  });

  test('códigos do esquema 1 que eram válidos continuam iguais (grelha e controlo)', () => {
    const r = aleatorio(99);
    let comparados = 0;
    for (let i = 0; i < 5000; i++) {
      const lat = -18 + r() * 13.6;
      const lng = 11.6 + r() * 12.5;
      const antiga = encodeGrid1(lat, lng, 8);
      if (antiga.includes('undefined')) continue;
      comparados++;
      expect(codificarGrelha(lat, lng)).toBe(antiga);
      expect(digitosControlo(`HUA-${antiga}`)).toBe(checksum1(`HUA-${antiga}`));
    }
    expect(comparados).toBeGreaterThan(3000);
  });

  test('os códigos antigos guardados continuam a passar no validate', () => {
    const grelha = encodeGrid1(-12.7761, 15.7392, 8);
    const antigo = `AO-HUA-${grelha}-${checksum1(`HUA-${grelha}`)}`;
    expect(servidor.validatePostalCode(antigo)).toEqual({ valid: true });
    expect(servidor.validatePostalCode(`AO-BEN-${grelha}-${checksum1(`BEN-${grelha}`)}`)).toEqual({ valid: true });
  });
});

describe('siglas das províncias (3 primeiras letras, como no esquema 1)', () => {
  test.each<[string | null | undefined, string]>([
    ['Huambo', 'HUA'],
    ['Luanda', 'LUA'],
    ['Benguela', 'BEN'],
    ['Cuanza Norte', 'CUA'],
    ['Lunda Sul', 'LUN'],
    ['Uíge', 'UÍG'],
    [null, 'XXX'],
    [undefined, 'XXX'],
    ['', 'XXX'],
  ])('%j → %s', (nome, sigla) => {
    expect(siglaProvincia(nome)).toBe(sigla);
    expect(servidor.siglaProvincia(nome)).toBe(sigla);
  });

  test('é a mesma regra do esquema 1', () => {
    for (const nome of ['Huambo', 'Bié', 'Moxico Leste', 'Ícolo e Bengo', 'x']) {
      expect(siglaProvincia(nome)).toBe(nome.substring(0, 3).toUpperCase());
    }
  });

  test('formato AO-PROV-GRID8-CHK', () => {
    const c = codigoPostalProvisorio(-12.7761, 15.7392, 'Huambo');
    expect(c.sigla).toBe('HUA');
    expect(c.grelha).toHaveLength(8);
    expect(c.codigo).toMatch(/^AO-[A-Z]{3}-[2-9A-HJ-NP-Z]{8}-\d{2}$/);
  });

  test('coordenada inválida dá erro', () => {
    expect(() => codigoPostalProvisorio(Number.NaN, 15)).toThrow();
  });
});
