import { describe, expect, test } from '@jest/globals';

import { desenhoMarca } from '../marcaDeAgua';

describe('faixa da marca de água', () => {
  test('foto 1280 × 960: faixa de 12% em baixo, duas linhas dentro dela', () => {
    const d = desenhoMarca(1280, 960);
    expect(d.alturaFaixa).toBe(115);
    expect(d.tamanhoLetra).toBe(35);
    const topo = 960 - d.alturaFaixa;
    expect(d.yLinhas[0]).toBeGreaterThan(topo + d.tamanhoLetra * 0.8);
    expect(d.yLinhas[1]).toBeGreaterThan(d.yLinhas[0] + d.tamanhoLetra);
    expect(d.yLinhas[1]).toBeLessThanOrEqual(960);
  });

  test('foto pequena: faixa com pelo menos 56 px', () => {
    expect(desenhoMarca(320, 240).alturaFaixa).toBe(56);
  });

  test('foto sem tamanho dá erro', () => {
    expect(() => desenhoMarca(0, 100)).toThrow();
  });
});
