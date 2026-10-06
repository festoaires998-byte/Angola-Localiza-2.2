import { describe, expect, test } from '@jest/globals';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { CABECALHO, CORES, PASTILHAS } from './tema';

/** Contraste WCAG entre duas cores #RRGGBB. */
function contraste(a: string, b: string): number {
  const luz = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe('paleta "Verde e sol": letra legível ao sol', () => {
  test.each([
    ['texto no fundo do ecrã', CORES.texto, CORES.fundoEcra],
    ['texto suave no fundo do ecrã', CORES.textoSuave, CORES.fundoEcra],
    ['texto suave nos cartões', CORES.textoSuave, CORES.fundo],
    ['letra dos botões e do título', CORES.sobrePrimaria, CORES.primaria],
    ['botão de contorno', CORES.primaria, CORES.fundo],
    ['botão de contorno no fundo do ecrã', CORES.primaria, CORES.fundoEcra],
    ['separador ativo', CORES.primaria, CORES.destaqueFundo],
    ['separador inativo', CORES.inativo, CORES.fundo],
    ['caixa de informação', CORES.texto, CORES.infoFundo],
    ['caixa de aviso', CORES.avisoTexto, CORES.avisoFundo],
    ['caixa de erro', CORES.texto, CORES.erroFundo],
    ['caixa de sucesso', CORES.texto, CORES.sucessoFundo],
    ['botão de perigo', CORES.perigo, CORES.fundo],
  ])('%s: pelo menos 4,5:1', (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  test('os ícones das pastilhas veem-se bem (pelo menos 4,5:1)', () => {
    for (const [cor, fundo] of Object.values(PASTILHAS)) expect(contraste(cor, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  test('a borda dos campos de texto vê-se (pelo menos 3:1)', () => {
    expect(contraste(CORES.borda, CORES.fundo)).toBeGreaterThanOrEqual(3);
  });

  test('é mesmo a paleta escolhida', () => {
    expect(CORES.primaria).toBe('#0B5D45');
    expect(CORES.destaque).toBe('#F6B800');
  });

  test('a barra de cima dos ecrãs com "voltar" é verde com letra branca, em todas as pilhas', () => {
    expect(CABECALHO.headerStyle.backgroundColor).toBe(CORES.primaria);
    expect(contraste(CABECALHO.headerTintColor, CABECALHO.headerStyle.backgroundColor)).toBeGreaterThanOrEqual(7);
    const separadores = join(__dirname, '../app/(tabs)');
    const pilhas = readdirSync(separadores, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(separadores, d.name, '_layout.tsx'));
    expect(pilhas.length).toBeGreaterThanOrEqual(5);
    for (const f of pilhas) expect(readFileSync(f, 'utf8')).toContain('...CABECALHO');
  });
});
