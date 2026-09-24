import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import * as fieldService from '../../supabase/functions/field-service/codigoPostal';
import * as gerarCodigo from '../../supabase/functions/generate-postal-code/codigoPostal';
import { encode as plusCodeFieldService } from '../../supabase/functions/field-service/plusCode';
import { codigoPostalProvisorio } from '@/domain/enderecamento/codigoPostal';
import { encode as plusCodeApp } from '@/domain/enderecamento/plusCode';

const raiz = join(__dirname, '..', '..');
const ler = (f: string) => readFileSync(join(raiz, f), 'utf8');

// Esquema 1, tal como estava na field-service (v19): grelha de 31 símbolos.
const GRID_ALPHABET_1 = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function encodeGrid1(lat: number, lng: number, length = 8): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, bits = '';
  let isLng = true;
  for (let i = 0; i < length * 5; i++) {
    if (isLng) { const mid = (lngMin + lngMax) / 2; if (lng >= mid) { bits += '1'; lngMin = mid; } else { bits += '0'; lngMax = mid; } }
    else { const mid = (latMin + latMax) / 2; if (lat >= mid) { bits += '1'; latMin = mid; } else { bits += '0'; latMax = mid; } }
    isLng = !isLng;
  }
  let code = '';
  for (let i = 0; i < bits.length; i += 5) code += GRID_ALPHABET_1[parseInt(bits.substring(i, i + 5).padEnd(5, '0'), 2)];
  return code;
}

describe('field-service: código postal da aprovação no esquema 2', () => {
  test('usa uma cópia EXATA do módulo da generate-postal-code (nunca podem divergir)', () => {
    expect(ler('supabase/functions/field-service/codigoPostal.ts')).toBe(
      ler('supabase/functions/generate-postal-code/codigoPostal.ts'),
    );
  });

  test('a função importa o módulo partilhado e já não tem a grelha antiga (31 símbolos)', () => {
    const fonte = ler('supabase/functions/field-service/index.ts');
    expect(fonte).toContain('import { codigoBase } from "./codigoPostal.ts";');
    expect(fonte).not.toMatch(/GRID_ALPHABET|function encodeGrid|function checksum/);
    expect(fonte).toMatch(/const \{ base, checksum: chk \} = codigoBase\(lat, lng, provinceName\);/);
  });

  test('no Huambo, onde o esquema 1 dava "undefined", o esquema 2 dá um código válido igual ao da app', () => {
    let comUndefined = 0;
    for (let i = 0; i < 4000; i++) {
      const lat = -12.9 + (i % 80) * 0.0047;
      const lng = 15.6 + Math.floor(i / 80) * 0.011;
      const antigo = encodeGrid1(lat, lng);
      const novo = fieldService.codigoBase(lat, lng, 'Huambo');
      expect(novo.postal_code).not.toContain('undefined');
      expect(fieldService.validatePostalCode(novo.postal_code).valid).toBe(true);
      expect(novo.postal_code).toBe(gerarCodigo.codigoBase(lat, lng, 'Huambo').postal_code);
      expect(novo.postal_code).toBe(codigoPostalProvisorio(lat, lng, 'Huambo').codigo);
      if (antigo.includes('undefined')) comUndefined++;
      // Onde o esquema 1 não tinha "undefined", o código é exatamente o mesmo (nada muda para quem já tem código).
      else expect(novo.gridCode).toBe(antigo);
    }
    // O erro era real: nesta zona havia pontos com "undefined" no esquema 1.
    expect(comUndefined).toBeGreaterThan(0);
  });
});

describe('field-service: a aprovação grava o plus_code', () => {
  const fonte = ler('supabase/functions/field-service/index.ts');

  test('usa uma cópia EXATA do módulo de Plus Codes da app', () => {
    expect(ler('supabase/functions/field-service/plusCode.ts')).toBe(ler('src/domain/enderecamento/plusCode.ts'));
    expect(fonte).toContain('import { encode as plusCode } from "./plusCode.ts";');
  });

  test('a morada nova (approve) e a fusão (merge) levam o plus_code com 10 dígitos', () => {
    expect(fonte).toContain('const PLUS_CODE_DIGITOS = 10;');
    const linhas = fonte.match(/plus_code: plusCode\(record\.latitude, record\.longitude, PLUS_CODE_DIGITOS\),/g) ?? [];
    expect(linhas).toHaveLength(2);
    const insert = fonte.slice(fonte.indexOf('supabase.from("addresses").insert('));
    expect(insert.slice(0, insert.indexOf('.select('))).toContain('plus_code: plusCode(');
  });

  test('o formato é o dos plus_code já guardados (ex.: "5FVQ5PWV+PJ") e igual ao da app', () => {
    const codigo = plusCodeFieldService(-12.7761, 15.7392, 10);
    expect(codigo).toMatch(/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$/);
    expect(codigo).toBe(plusCodeApp(-12.7761, 15.7392, 10));
  });
});
