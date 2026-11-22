import { describe, expect, test } from '@jest/globals';

import {
  ORIENTACAO_INICIAL,
  VISTA,
  outraOrientacao,
  rotuloOrientacao,
  seguimentoCamara,
  vistaAoEscolher,
} from './orientacao';

describe('Orientação do mapa (como num jogo)', () => {
  test('começa a seguir a direção da pessoa, com o mapa inclinado e mais perto', () => {
    expect(ORIENTACAO_INICIAL).toBe('direcao');
    expect(VISTA.direcao.pitch).toBeGreaterThan(40);
    expect(VISTA.direcao.zoom).toBeGreaterThan(VISTA.norte.zoom);
    expect(VISTA.norte.pitch).toBe(0);
  });

  test('a câmara usa a bússola só no modo "direção" e só enquanto segue a pessoa', () => {
    expect(seguimentoCamara('direcao', true)).toBe('heading');
    expect(seguimentoCamara('norte', true)).toBe('default');
    expect(seguimentoCamara('direcao', false)).toBeUndefined();
    expect(seguimentoCamara('norte', false)).toBeUndefined();
  });

  test('ao escolher "Norte" o mapa volta a ficar plano e com o Norte em cima', () => {
    expect(vistaAoEscolher('norte')).toEqual({ pitch: 0, zoom: 16, bearing: 0 });
    expect(vistaAoEscolher('direcao')).toEqual({ pitch: 55, zoom: 17.5 });
    expect(vistaAoEscolher('direcao')).not.toHaveProperty('bearing');
  });

  test('o botão alterna entre os dois modos e diz o modo atual', () => {
    expect(outraOrientacao('direcao')).toBe('norte');
    expect(outraOrientacao('norte')).toBe('direcao');
    expect(rotuloOrientacao('direcao').curto).toBe('Direção');
    expect(rotuloOrientacao('norte').curto).toBe('Norte');
    expect(rotuloOrientacao('direcao').acessivel).toMatch(/segue a tua direção/);
    expect(rotuloOrientacao('norte').acessivel).toMatch(/Norte para cima/);
  });
});
