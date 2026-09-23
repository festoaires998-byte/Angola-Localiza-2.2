import { describe, expect, test } from '@jest/globals';

import { decode, encode, isFull, isValid } from './plusCode';

/**
 * Função antiga usada no site em produção, copiada tal e qual.
 * Serve de referência: os códigos já guardados no Supabase foram feitos com ela.
 */
// prettier-ignore
function encodeOLC(lat: any, lng: any) {
  var ALPHABET = '23456789CFGHJMPQRVWX';
  var RES = [20.0, 1.0, 0.05, 0.0025, 0.000125];
  lat = Math.min(90, Math.max(-90, lat));
  if (lat === 90) lat -= 0.000000001;
  var lng2 = lng;
  while (lng2 < -180) lng2 += 360;
  while (lng2 >= 180) lng2 -= 360;
  var latVal = lat + 90, lngVal = lng2 + 180, code = '';
  for (var i = 0; i < 5; i++) {
    var latDigit = Math.floor(latVal / RES[i]); latVal -= latDigit * RES[i]; code += ALPHABET[latDigit];
    var lngDigit = Math.floor(lngVal / RES[i]); lngVal -= lngDigit * RES[i]; code += ALPHABET[lngDigit];
    if (i === 3) code += '+';
  }
  return code;
}

/**
 * Gerador de números aleatórios com semente fixa (mulberry32).
 * Assim, se um teste falhar, volta a falhar com as mesmas coordenadas.
 */
function geradorAleatorio(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Limites aproximados de Angola. */
const ANGOLA = { latMin: -18.1, latMax: -4.4, lngMin: 11.6, lngMax: 24.1 };

function coordenadasEmAngola(quantidade: number, semente: number): Array<[number, number]> {
  const aleatorio = geradorAleatorio(semente);
  const lista: Array<[number, number]> = [];
  for (let i = 0; i < quantidade; i++) {
    const lat = ANGOLA.latMin + aleatorio() * (ANGOLA.latMax - ANGOLA.latMin);
    const lng = ANGOLA.lngMin + aleatorio() * (ANGOLA.lngMax - ANGOLA.lngMin);
    lista.push([lat, lng]);
  }
  return lista;
}

/** Diz se a coordenada está dentro da área (limites incluídos). */
function areaContem(area: ReturnType<typeof decode>, lat: number, lng: number): boolean {
  return (
    lat >= area.latitudeMin &&
    lat <= area.latitudeMax &&
    lng >= area.longitudeMin &&
    lng <= area.longitudeMax
  );
}

describe('compatibilidade com a função antiga do site', () => {
  const coordenadas = coordenadasEmAngola(1000, 20260923);

  test('usa 1000 coordenadas aleatórias dentro de Angola', () => {
    expect(coordenadas).toHaveLength(1000);
  });

  test.each(coordenadas)(
    '(%f, %f): os 10 dígitos (+ o "+") de encode(..., 11) são iguais aos da função antiga',
    (lat, lng) => {
      const antigo = encodeOLC(lat, lng); // ex.: "6F3M566M+MQ" (10 dígitos + "+")
      expect(encode(lat, lng, 11).slice(0, antigo.length)).toBe(antigo);
      expect(encode(lat, lng, 10)).toBe(antigo);
    },
  );
});

describe('casos concretos em Angola', () => {
  const casos: Array<[string, number, number, string]> = [
    ['Luanda', -8.8383, 13.2344, '6F3M566M+MQJ'],
    ['Huambo', -12.7761, 15.7392, '5FVQ6PFQ+HM8'],
    ['Lubango', -14.9177, 13.4925, '5FQM3FJV+W2C'],
    ['Cabinda', -5.5596, 12.1896, '6F6JC5RQ+5R9'],
    ['Santa Clara (limite sul)', -17.3906, 15.8872, '5FJQJV5P+QV8'],
  ];

  test.each(casos)('%s', (_nome, lat, lng, esperado) => {
    expect(encode(lat, lng)).toBe(esperado);
    expect(encode(lat, lng, 10)).toBe(esperado.slice(0, 11));
    expect(encode(lat, lng, 10)).toBe(encodeOLC(lat, lng));
    expect(isValid(esperado)).toBe(true);
    expect(isFull(esperado)).toBe(true);
  });
});

describe('encode seguido de decode', () => {
  test.each(coordenadasEmAngola(200, 42))('(%f, %f) fica dentro da área devolvida', (lat, lng) => {
    for (const comprimento of [10, 11, 12, 15]) {
      const area = decode(encode(lat, lng, comprimento));
      expect(areaContem(area, lat, lng)).toBe(true);
      expect(area.comprimento).toBe(comprimento);
      // O centro também tem de estar dentro da área.
      expect(areaContem(area, area.centro.latitude, area.centro.longitude)).toBe(true);
    }
  });

  test('área de um código de 10 dígitos mede 0,000125° × 0,000125°', () => {
    const area = decode('6F3M566M+MQ');
    expect(area.latitudeMax - area.latitudeMin).toBeCloseTo(0.000125, 12);
    expect(area.longitudeMax - area.longitudeMin).toBeCloseTo(0.000125, 12);
  });

  test('aceita letras minúsculas', () => {
    expect(decode('6f3m566m+mqj')).toEqual(decode('6F3M566M+MQJ'));
  });

  test('vetores oficiais da especificação', () => {
    expect(encode(47.365590, 8.524997, 10)).toBe('8FVC9G8F+6X');
    expect(encode(20.3701135, 2.78223535156, 13)).toBe('7FG49QCJ+2VXGJ');
    expect(encode(1, 1, 4)).toBe('6FH30000+');
    const area = decode('7FG49QCJ+2VXGJ');
    expect(area.latitudeMin).toBeCloseTo(20.370113, 9);
    expect(area.longitudeMin).toBeCloseTo(2.782234375, 9);
  });

  test('decode rejeita códigos curtos ou inválidos', () => {
    expect(() => decode('MQ66+2V')).toThrow();
    expect(() => decode('abc')).toThrow();
  });
});

describe('casos-limite', () => {
  test('latitude 90 (polo norte) fica na última célula', () => {
    const codigo = encode(90, 0);
    expect(codigo).toBe('CFX2X2X2+X2R');
    expect(codigo.slice(0, 11)).toBe(encodeOLC(90, 0));
    const area = decode(codigo);
    expect(area.latitudeMax).toBe(90);
    expect(area.centro.latitude).toBeLessThanOrEqual(90);
  });

  test('latitude -90 (polo sul) fica na primeira célula', () => {
    const codigo = encode(-90, 0);
    expect(codigo).toBe('2F222222+222');
    expect(codigo.slice(0, 11)).toBe(encodeOLC(-90, 0));
    expect(decode(codigo).latitudeMin).toBe(-90);
  });

  test('latitudes fora do mapa são encostadas aos polos', () => {
    expect(encode(95, 0)).toBe(encode(90, 0));
    expect(encode(-95, 0)).toBe(encode(-90, 0));
  });

  test('longitude 180 é o mesmo que -180', () => {
    expect(encode(0, 180)).toBe('62G22222+222');
    expect(encode(0, -180)).toBe('62G22222+222');
    expect(encode(0, 180).slice(0, 11)).toBe(encodeOLC(0, 180));
    expect(encode(0, -180).slice(0, 11)).toBe(encodeOLC(0, -180));
  });

  test('longitudes fora de -180..180 dão a volta ao mundo', () => {
    expect(encode(-8.8383, 13.2344 + 360)).toBe(encode(-8.8383, 13.2344));
    expect(encode(-8.8383, 13.2344 - 720)).toBe(encode(-8.8383, 13.2344));
  });

  test('comprimentos inválidos e coordenadas que não são números dão erro', () => {
    expect(() => encode(0, 0, 1)).toThrow();
    expect(() => encode(0, 0, 7)).toThrow();
    expect(() => encode(Number.NaN, 0)).toThrow();
    expect(() => encode(0, Number.POSITIVE_INFINITY)).toThrow();
  });

  test.each([
    '', // vazio
    '6F3M566M', // sem "+"
    '6F3M566M+MQ+', // dois "+"
    '6F3M566+MQ', // "+" em posição ímpar
    '6F3M566MMQ+J', // "+" depois da posição 8
    '6F3M566M+M', // só um carácter depois do "+"
    '6F3M566A+MQ', // letra fora do alfabeto (vogal)
    '6F3M 66M+MQ', // espaço
    '6F3M0000+MQ', // enchimento seguido de dígitos
    '6F3M000+', // enchimento com número ímpar de zeros
    '0F3M0000+', // começa por zero
    '6F00M000+', // dois blocos de zeros
  ])('isValid rejeita "%s"', (codigo) => {
    expect(isValid(codigo)).toBe(false);
  });

  test.each(['6F3M566M+MQ', '6F3M566M+MQJ', '6f3m566m+mqj', '6F3M0000+', 'MQ66+2V'])(
    'isValid aceita "%s"',
    (codigo) => {
      expect(isValid(codigo)).toBe(true);
    },
  );

  test('isFull distingue códigos completos de curtos e fora do mapa', () => {
    expect(isFull('6F3M566M+MQ')).toBe(true);
    expect(isFull('MQ66+2V')).toBe(false);
    expect(isFull('X2222222+22')).toBe(false); // latitude acima de 90°
    expect(isFull('2X222222+22')).toBe(false); // longitude acima de 180°
  });
});

/**
 * Nota importante sobre compatibilidade.
 *
 * A função antiga faz as contas com números decimais (vírgula flutuante).
 * Quando uma coordenada cai EXATAMENTE em cima da linha que separa duas
 * células (acontece com coordenadas "redondas", ex.: -11.765), a função
 * antiga às vezes escolhe a célula vizinha, a sul ou a oeste. O módulo novo
 * segue a especificação oficial e escolhe sempre a célula a norte / a este.
 *
 * Com coordenadas de GPS com muitas casas decimais isto praticamente nunca
 * acontece. Este teste fixa esse comportamento e mostra que o código antigo
 * continua a apontar para o mesmo sítio: o ponto fica na borda da sua área.
 */
describe('pontos exatamente na linha entre duas células', () => {
  test('(-11.765, 13.39511): código antigo e novo são células vizinhas', () => {
    const antigo = encodeOLC(-11.765, 13.39511);
    const novo = encode(-11.765, 13.39511, 10);
    expect(antigo).toBe('5FWM69MW+X2');
    expect(novo).toBe('5FWM69PW+22');
    // O ponto está na borda norte da célula antiga...
    expect(decode(antigo).latitudeMax).toBeCloseTo(-11.765, 12);
    // ...e na borda sul da célula nova.
    expect(decode(novo).latitudeMin).toBeCloseTo(-11.765, 12);
  });
});
