import { describe, expect, test } from '@jest/globals';

import {
  CAPTURA_INICIAL,
  combinarLeituras,
  distanciaM,
  juntarLeitura,
  leiturasBoas,
  MAX_LEITURAS,
  medirDeNovo,
  type EstadoCaptura,
  type Leitura,
} from './capturaGps';
import { codificarGrelha } from './codigoPostal';

const BASE = { latitude: -12.7761, longitude: 15.7392 };
/** 1 m em graus de latitude (aprox.). */
const M = 1 / 111_195;

let hora = 0;
function leitura(norteM: number, precisao: number | null): Leitura {
  hora += 1000;
  return { latitude: BASE.latitude + norteM * M, longitude: BASE.longitude, precisao, hora };
}

function juntar(leituras: Leitura[], inicio: EstadoCaptura = CAPTURA_INICIAL): EstadoCaptura {
  return leituras.reduce(juntarLeitura, inicio);
}

describe('combinarLeituras', () => {
  test('precisa de 3 leituras boas', () => {
    expect(combinarLeituras([leitura(0, 5), leitura(0, 5)])).toBeNull();
    const c = combinarLeituras([leitura(0, 5), leitura(0, 5), leitura(0, 5)]);
    expect(c).toMatchObject({ leituras: 3, fraca: false, precisao: 5 });
  });

  test('deita fora as leituras piores que ±30 m', () => {
    const c = combinarLeituras([leitura(0, 8), leitura(200, 60), leitura(0, 8), leitura(0, 8)]);
    expect(c).not.toBeNull();
    expect(c!.leituras).toBe(3);
    expect(distanciaM(c!, BASE)).toBeLessThan(0.5);
  });

  test('média com mais peso nas leituras mais precisas', () => {
    // Duas de ±5 m a 0 m e uma de ±20 m a 17 m (cada ±5 m pesa 16 vezes mais):
    // a média fica a ~0,5 m (a média simples daria 5,7 m).
    const c = combinarLeituras([leitura(0, 5), leitura(0, 5), leitura(17, 20)])!;
    const norte = (c.latitude - BASE.latitude) / M;
    expect(norte).toBeCloseTo(17 / 33, 1);
    expect(c.precisao).toBe(5);
  });

  test('sinal fraco: ao fim de 10 leituras usa as 3 melhores e marca "fraca"', () => {
    const fracas = Array.from({ length: MAX_LEITURAS - 1 }, (_, i) => leitura(i, 40 + i));
    expect(combinarLeituras(fracas)).toBeNull();
    const c = combinarLeituras([...fracas, leitura(0, 35)])!;
    expect(c).toMatchObject({ fraca: true, leituras: 3, precisao: 35 });
  });

  test('leituras sem precisão não contam como boas', () => {
    expect(leiturasBoas([leitura(0, null), leitura(0, 5), leitura(0, 31)])).toBe(1);
    expect(combinarLeituras([leitura(0, null), leitura(0, null), leitura(0, null)])).toBeNull();
  });
});

describe('juntarLeitura', () => {
  test('fixa a captura à 3.ª leitura boa e deixa de medir', () => {
    let e = juntar([leitura(0, 6), leitura(1, 6)]);
    expect(e.aMedir).toBe(true);
    expect(e.captura).toBeNull();
    e = juntarLeitura(e, leitura(-1, 6));
    expect(e.aMedir).toBe(false);
    expect(e.captura).toMatchObject({ leituras: 3, fraca: false });
  });

  test('parado: leituras a saltar ±15 m não mudam a captura (nem a célula do código)', () => {
    const e = juntar([leitura(0, 10), leitura(0, 10), leitura(0, 10)]);
    const celula = codificarGrelha(e.captura!.latitude, e.captura!.longitude);
    const depois = juntar([leitura(15, 15), leitura(-12, 15), leitura(8, 15)], e);
    expect(depois).toBe(e);
    expect(codificarGrelha(depois.captura!.latitude, depois.captura!.longitude)).toBe(celula);
  });

  test('a pessoa afastou-se mais de 20 m: mede de novo, mantendo a captura anterior à vista', () => {
    const e = juntar([leitura(0, 5), leitura(0, 5), leitura(0, 5)]);
    const aAndar = juntarLeitura(e, leitura(40, 5));
    expect(aAndar.aMedir).toBe(true);
    expect(aAndar.captura).toBe(e.captura);
    const nova = juntar([leitura(41, 5), leitura(42, 5)], aAndar);
    expect(nova.aMedir).toBe(false);
    expect(distanciaM(nova.captura!, BASE)).toBeGreaterThan(35);
  });

  test('uma leitura má longe não faz medir de novo', () => {
    const e = juntar([leitura(0, 5), leitura(0, 5), leitura(0, 5)]);
    expect(juntarLeitura(e, leitura(100, 80))).toBe(e);
  });

  test('ignora a mesma leitura repetida (mesma hora)', () => {
    const l = leitura(0, 5);
    const e = juntar([l, l, l]);
    expect(e.captura).toBeNull();
    expect(e.leituras).toHaveLength(1);
  });

  test('captura fraca: continua a medir e melhora quando o sinal melhora', () => {
    const fracas = Array.from({ length: MAX_LEITURAS }, () => leitura(0, 50));
    let e = juntar(fracas);
    expect(e.captura?.fraca).toBe(true);
    expect(e.aMedir).toBe(true);
    e = juntar([leitura(0, 6), leitura(0, 6), leitura(0, 6)], e);
    expect(e.captura).toMatchObject({ fraca: false, precisao: 6 });
    expect(e.aMedir).toBe(false);
  });

  test('"Medir de novo" recomeça sem apagar a captura à vista', () => {
    const e = juntar([leitura(0, 5), leitura(0, 5), leitura(0, 5)]);
    const d = medirDeNovo(e);
    expect(d).toMatchObject({ aMedir: true, leituras: [], captura: e.captura });
  });
});
