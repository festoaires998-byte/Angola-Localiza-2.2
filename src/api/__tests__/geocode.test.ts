import { describe, expect, test } from '@jest/globals';

import { lerCodigoPostal, lerProvinciaMunicipio } from '../geocodeNucleo';

describe('respostas do geocode e do generate-postal-code', () => {
  test('província em state e município em county', () => {
    expect(
      lerProvinciaMunicipio({ address: { state: 'Huambo', county: 'Huambo', country: 'Angola' } }),
    ).toEqual({ provincia: 'Huambo', municipio: 'Huambo' });
  });

  test('município: municipality > county > city > town', () => {
    expect(lerProvinciaMunicipio({ address: { state: 'Huambo', city: 'Caála', town: 'x' } }).municipio).toBe('Caála');
    expect(lerProvinciaMunicipio({ address: { municipality: 'M', county: 'C' } }).municipio).toBe('M');
  });

  test('resposta sem morada (ou erro da LocationIQ)', () => {
    expect(lerProvinciaMunicipio({ error: 'Unable to geocode' })).toEqual({ provincia: null, municipio: null });
    expect(lerProvinciaMunicipio(null)).toEqual({ provincia: null, municipio: null });
    expect(lerProvinciaMunicipio({ address: { state: '  ' } }).provincia).toBeNull();
  });

  test('código postal do servidor', () => {
    expect(lerCodigoPostal({ postal_code: 'AO-HUA-MNFQR6JW-2-41', disambiguator: 2 })).toEqual({
      codigo: 'AO-HUA-MNFQR6JW-2-41',
      desambiguador: 2,
    });
    expect(lerCodigoPostal({ postal_code: 'AO-HUA-MNFQR6JW-41', disambiguator: null }).desambiguador).toBeNull();
    expect(() => lerCodigoPostal({ error: 'x' })).toThrow();
  });
});
