import { describe, expect, test } from '@jest/globals';

import {
  coordenadasValidas,
  ERRO_SEM_CHAVE,
  esconderChave,
  lerChave,
  urlOptimize,
  urlReverse,
} from '../../../supabase/functions/geocode/locationiq';

// Chave falsa, só para os testes.
const CHAVE = 'pk.chave-de-teste-123';

describe('Edge Function geocode: chave da LocationIQ no segredo', () => {
  test('lê o segredo LOCATIONIQ_KEY', () => {
    expect(lerChave((n) => (n === 'LOCATIONIQ_KEY' ? ` ${CHAVE} ` : undefined))).toBe(CHAVE);
  });

  test('sem segredo (ou vazio): null, e a mensagem de erro não mostra nenhuma chave', () => {
    expect(lerChave(() => undefined)).toBeNull();
    expect(lerChave(() => '   ')).toBeNull();
    expect(ERRO_SEM_CHAVE).toContain('LOCATIONIQ_KEY');
    expect(ERRO_SEM_CHAVE).not.toMatch(/pk\./);
  });

  test('URLs da LocationIQ', () => {
    expect(urlReverse(CHAVE, -12.7761, 15.7392)).toBe(
      `https://us1.locationiq.com/v1/reverse?key=${encodeURIComponent(CHAVE)}&lat=-12.7761&lon=15.7392&format=json&addressdetails=1`,
    );
    expect(urlOptimize(CHAVE, '15.73,-12.77;15.74,-12.78')).toBe(
      `https://us1.locationiq.com/v1/optimize/driving/15.73,-12.77;15.74,-12.78?key=${encodeURIComponent(CHAVE)}&roundtrip=false&source=first`,
    );
  });

  test('um erro com o URL nunca deixa sair a chave', () => {
    const erro = `TypeError: error sending request for url (${urlReverse(CHAVE, -12.7, 15.7)})`;
    const limpo = esconderChave(erro, CHAVE);
    expect(limpo).not.toContain(CHAVE);
    expect(limpo).not.toContain('chave-de-teste');
    expect(limpo).toContain('key=***');
    expect(esconderChave(`a chave é ${CHAVE}`, CHAVE)).toBe('a chave é ***');
  });

  test('optimize só aceita coordenadas (não deixa meter outros parâmetros no URL)', () => {
    expect(coordenadasValidas('15.73,-12.77;15.74,-12.78')).toBe(true);
    expect(coordenadasValidas('15,-12;16,-13;17,-14')).toBe(true);
    expect(coordenadasValidas('15.73,-12.77')).toBe(false); // só 1 ponto
    expect(coordenadasValidas('15.73,-12.77;15.74,-12.78?key=outra')).toBe(false);
    expect(coordenadasValidas(42)).toBe(false);
  });
});
