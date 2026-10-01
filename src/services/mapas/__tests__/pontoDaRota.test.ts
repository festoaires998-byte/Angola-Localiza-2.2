import { describe, expect, test } from '@jest/globals';

import { parametrosDoPonto, pontoDaRota } from '../pontoDaRota';

describe('pontoDaRota', () => {
  test('lê latitude, longitude e título', () => {
    expect(pontoDaRota({ lat: '-12.77', lng: '15.73', titulo: 'Destino: Maria' })).toEqual({
      latitude: -12.77,
      longitude: 15.73,
      titulo: 'Destino: Maria',
    });
  });

  test('ida e volta com parametrosDoPonto', () => {
    const ponto = { latitude: -8.8383, longitude: 13.2344, titulo: 'Luanda' };
    expect(pontoDaRota(parametrosDoPonto(ponto))).toEqual(ponto);
  });

  test('sem título usa "Ponto"; título comprido é cortado; listas usam o primeiro valor', () => {
    expect(pontoDaRota({ lat: '1', lng: '2' })?.titulo).toBe('Ponto');
    expect(pontoDaRota({ lat: '1', lng: '2', titulo: 'x'.repeat(300) })?.titulo).toHaveLength(120);
    expect(pontoDaRota({ lat: ['1', '9'], lng: ['2'] })).toMatchObject({ latitude: 1, longitude: 2 });
  });

  test('recusa coordenadas em falta, inválidas, fora do mundo ou 0,0', () => {
    for (const p of [
      {},
      { lat: '1' },
      { lat: '', lng: '2' },
      { lat: 'abc', lng: '2' },
      { lat: '91', lng: '2' },
      { lat: '1', lng: '181' },
      { lat: '0', lng: '0' },
      { lat: 'Infinity', lng: '2' },
    ]) {
      expect(pontoDaRota(p)).toBeNull();
    }
  });
});
