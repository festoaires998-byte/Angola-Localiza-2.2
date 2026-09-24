import { describe, expect, test } from '@jest/globals';

import { desenhoMarca, ladoALado, separarEmoji } from '../marcaDeAgua';

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

describe('fotos lado a lado (as duas selfies)', () => {
  test('mesma altura, uma a seguir à outra', () => {
    expect(ladoALado([{ largura: 720, altura: 960 }, { largura: 1080, altura: 1440 }], 960)).toEqual({
      largura: 1440,
      altura: 960,
      posicoes: [
        { x: 0, largura: 720 },
        { x: 720, largura: 720 },
      ],
    });
    expect(() => ladoALado([], 960)).toThrow();
  });
});

describe('emoji no início da linha (desenhado com a fonte de emojis)', () => {
  test('separa o 📍 do resto; linhas sem emoji ficam iguais', () => {
    expect(separarEmoji('📍 5FVQ6PFQ+HJ9 · -12.77610, 15.73925')).toEqual({ emoji: '📍', resto: '5FVQ6PFQ+HJ9 · -12.77610, 15.73925' });
    expect(separarEmoji('24/09/2026 09:05:07')).toEqual({ emoji: null, resto: '24/09/2026 09:05:07' });
  });
});
