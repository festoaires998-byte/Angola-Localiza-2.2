import { describe, expect, test } from '@jest/globals';

import { DESAFIOS, EMOJI_DESAFIO, escolherDesafio, linhasMarcaVerificacao, nomeNoBucket, passoSeguinte } from './verificacaoSimples';

describe('verificação simples: regras', () => {
  test('o gesto é escolhido ao acaso entre os da lista', () => {
    expect(escolherDesafio(() => 0)).toBe(DESAFIOS[0]);
    expect(escolherDesafio(() => 0.999999)).toBe(DESAFIOS[DESAFIOS.length - 1]);
    expect(escolherDesafio(() => 1)).toBe(DESAFIOS[DESAFIOS.length - 1]);
  });

  test('passos por ordem: frente, verso, selfie, selfie com o gesto', () => {
    expect(passoSeguinte({})).toBe('frente');
    expect(passoSeguinte({ frente: 1, verso: 1 })).toBe('selfie');
    expect(passoSeguinte({ frente: 1, verso: 1, selfie: 1 })).toBe('selfieDesafio');
    expect(passoSeguinte({ frente: 1, verso: 1, selfie: 1, selfieDesafio: 1 })).toBeNull();
  });

  test('marca de água: como no site, e com o gesto nas selfies', () => {
    const d = new Date(2026, 8, 24, 10, 5, 3);
    expect(linhasMarcaVerificacao(d)).toEqual(['Angola Localiza — verificação', '24/09/2026 10:05:03']);
    expect(linhasMarcaVerificacao(d, 'Fecha um olho')[1]).toBe('24/09/2026 10:05:03 · Gesto: Fecha um olho');
  });

  test('nome no bucket privado', () => {
    // Na pasta da pessoa: o bucket só a deixa escrever em "<o seu id>/…".
    expect(nomeNoBucket('u1', 'verso', 42)).toBe('u1/cidadao-verso-42.jpg');
  });
});

describe('emoji de cada gesto', () => {
  test('todos os gestos têm um emoji, e emojis diferentes', () => {
    for (const d of DESAFIOS) expect(EMOJI_DESAFIO[d]).toMatch(/\p{Extended_Pictographic}/u);
    expect(new Set(DESAFIOS.map((d) => EMOJI_DESAFIO[d])).size).toBe(DESAFIOS.length);
  });

  test('o emoji bate com o gesto', () => {
    expect(EMOJI_DESAFIO['Põe a mão aberta ao lado da cara']).toBe('✋');
    expect(EMOJI_DESAFIO['Sorri com a boca aberta']).toBe('😁');
    expect(EMOJI_DESAFIO['Fecha um olho']).toBe('😉');
    expect(EMOJI_DESAFIO['Põe o polegar para cima ao lado da cara']).toBe('👍');
    expect(EMOJI_DESAFIO['Olha para a tua esquerda']).toContain('⬅️');
    expect(EMOJI_DESAFIO['Olha para a tua direita']).toContain('➡️');
  });
});
