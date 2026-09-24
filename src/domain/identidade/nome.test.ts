import { describe, expect, test } from '@jest/globals';

import { erroNome, nomeDaConta, normalizarNome } from './nome';

describe('nome completo', () => {
  test('tira espaços a mais', () => {
    expect(normalizarNome('  Ana   Maria\tSilva ')).toBe('Ana Maria Silva');
  });

  test('aceita nomes angolanos com acentos, hífen e apóstrofo', () => {
    for (const n of ['Ana Silva', 'João Manuel dos Santos', 'Luís Kiala-Ngola', "Maria D'Almeida", 'Nzinga Mbande', 'Ângela Tchiwale']) {
      expect(erroNome(n)).toBeNull();
    }
  });

  test('recusa vazio, só o primeiro nome, números/símbolos e nomes longos demais', () => {
    expect(erroNome('   ')).toBe('Escreve o teu nome completo.');
    expect(erroNome('Ana')).toMatch(/nome e o apelido/);
    expect(erroNome('A B')).toMatch(/nome e o apelido/);
    expect(erroNome('Ana Silva 2')).toMatch(/só pode ter letras/);
    expect(erroNome('ana@exemplo.ao')).toMatch(/só pode ter letras/);
    expect(erroNome(`Ana ${'a'.repeat(80)}`)).toMatch(/demasiado longo/);
  });

  test('lê o nome dos metadados da conta', () => {
    expect(nomeDaConta({ full_name: '  Ana  Silva ' })).toBe('Ana Silva');
    expect(nomeDaConta({ full_name: '   ' })).toBeNull();
    expect(nomeDaConta({ name: 'Outro' })).toBeNull();
    expect(nomeDaConta({ full_name: 42 })).toBeNull();
    expect(nomeDaConta(null)).toBeNull();
    expect(nomeDaConta(undefined)).toBeNull();
  });
});
