import { describe, expect, test } from '@jest/globals';

import { codigoPostalProvisorio, codificarGrelha, digitosControlo, siglaProvincia } from './codigoPostal';

// ─── Referência: copiado TAL COMO ESTÁ da Edge Function generate-postal-code (v2) ───
// Não "melhorar" este bloco: serve para provar que a app calcula o mesmo que o servidor.
const GRID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function encodeGrid(lat: number, lng: number, length: number): string {
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
  for (let i = 0; i < bits.length; i += 5) code += GRID_ALPHABET[parseInt(bits.substring(i, i + 5).padEnd(5, '0'), 2)];
  return code;
}
function checksum(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const idx = GRID_ALPHABET.indexOf(input[i]);
    const val = idx >= 0 ? idx + 1 : input.charCodeAt(i);
    sum = (sum + val * (i + 1)) % 9973;
  }
  return (((sum % 97) + 1)).toString().padStart(2, '0');
}
function referencia(latitude: number, longitude: number, provinceName?: string): string {
  const provinceCode = provinceName ? provinceName.substring(0, 3).toUpperCase() : 'XXX';
  const gridCode = encodeGrid(latitude, longitude, 8);
  const base = `${provinceCode}-${gridCode}`;
  return `AO-${base}-${checksum(base)}`;
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

describe('Código Postal Digital (local)', () => {
  test('dá o mesmo que o servidor em 5000 pontos de Angola', () => {
    const r = aleatorio(42);
    const provincias = ['Huambo', 'Luanda', 'Bié', 'Uíge', undefined];
    for (let i = 0; i < 5000; i++) {
      const lat = -18 + r() * 13.6; // Angola: ~-18.0 a -4.4
      const lng = 11.6 + r() * 12.5; // ~11.6 a 24.1
      const prov = provincias[i % provincias.length];
      expect(codigoPostalProvisorio(lat, lng, prov).codigo).toBe(referencia(lat, lng, prov));
    }
  });

  test('pontos no limite de células dão o mesmo que o servidor', () => {
    for (const [lat, lng] of [[0, 0], [-12.5, 15.75], [-90, -180], [89.999, 179.999], [-12.776, 15.739]]) {
      expect(codigoPostalProvisorio(lat, lng, 'Huambo').codigo).toBe(referencia(lat, lng, 'Huambo'));
    }
  });

  test('formato AO-PROV-GRID8-CHK, que o servidor valida', () => {
    const c = codigoPostalProvisorio(-12.7761, 15.7392, 'Huambo');
    expect(c.sigla).toBe('HUA');
    expect(c.grelha).toHaveLength(8);
    expect(c.codigo).toMatch(/^AO-[A-Z]{3}-[2-9A-HJ-NP-Z]{8}-\d{2}$/);
    expect(c.controlo).toBe(digitosControlo(`HUA-${c.grelha}`));
  });

  test('sem província: XXX (como o servidor)', () => {
    expect(siglaProvincia(null)).toBe('XXX');
    expect(codigoPostalProvisorio(-12.7761, 15.7392).codigo.startsWith('AO-XXX-')).toBe(true);
  });

  test('pontos próximos (mesma célula) dão a mesma grelha', () => {
    expect(codificarGrelha(-12.77610, 15.73920)).toBe(codificarGrelha(-12.77611, 15.73921));
  });

  test('coordenada inválida dá erro', () => {
    expect(() => codigoPostalProvisorio(Number.NaN, 15)).toThrow();
  });
});
