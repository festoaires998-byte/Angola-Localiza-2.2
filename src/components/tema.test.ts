import { describe, expect, test } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { cabecalho, CORES_CLARO, CORES_ESCURO, fonteDoPeso, FONTES, PASTILHAS_CLARO, PASTILHAS_ESCURO, type Cores } from './tema';

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

const PARES = (c: Cores): [string, string, string][] => [
  ['texto no fundo do ecrã', c.texto, c.fundoEcra],
  ['texto suave no fundo do ecrã', c.textoSuave, c.fundoEcra],
  ['texto suave nos cartões', c.textoSuave, c.fundo],
  ['letra dos botões', c.sobrePrimaria, c.primaria],
  ['título na faixa', c.sobreFaixa, c.faixa],
  ['botão de contorno', c.primaria, c.fundo],
  ['botão de contorno no fundo do ecrã', c.primaria, c.fundoEcra],
  ['separador ativo', c.primaria, c.destaqueFundo],
  ['separador inativo', c.inativo, c.fundo],
  ['caixa de informação', c.texto, c.infoFundo],
  ['caixa de aviso', c.avisoTexto, c.avisoFundo],
  ['caixa de erro', c.texto, c.erroFundo],
  ['caixa de sucesso', c.texto, c.sucessoFundo],
  ['botão de perigo', c.perigo, c.fundo],
  ['botão amarelo', c.sobreDestaque, c.destaque],
];

describe.each([
  ['claro', CORES_CLARO, PASTILHAS_CLARO],
  ['escuro', CORES_ESCURO, PASTILHAS_ESCURO],
])('paleta "Verde e sol", modo %s: letra legível', (_modo, cores, pastilhas) => {
  test.each(PARES(cores))('%s: pelo menos 4,5:1', (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  test('os ícones das pastilhas veem-se bem (pelo menos 4,5:1)', () => {
    for (const [cor, fundo] of Object.values(pastilhas)) expect(contraste(cor, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  test('a borda dos campos de texto vê-se (pelo menos 3:1)', () => {
    expect(contraste(cores.borda, cores.fundo)).toBeGreaterThanOrEqual(3);
  });
});

describe('tema', () => {
  test('as duas paletas têm as mesmas cores (nenhuma fica sem versão escura)', () => {
    expect(Object.keys(CORES_ESCURO).sort()).toEqual(Object.keys(CORES_CLARO).sort());
    expect(Object.keys(PASTILHAS_ESCURO).sort()).toEqual(Object.keys(PASTILHAS_CLARO).sort());
  });

  test('é mesmo a paleta escolhida', () => {
    expect(CORES_CLARO.primaria).toBe('#0B5D45');
    expect(CORES_CLARO.destaque).toBe('#F6B800');
    expect(CORES_ESCURO.faixa).toBe('#0B5D45');
  });

  test('cada peso de letra tem o seu ficheiro', () => {
    expect(fonteDoPeso('800')).toBe(FONTES.extra);
    expect(fonteDoPeso('bold')).toBe(FONTES.negrito);
    expect(fonteDoPeso(600)).toBe(FONTES.semi);
    expect(fonteDoPeso(undefined)).toBe(FONTES.normal);
  });

  test('a barra de cima dos ecrãs com "voltar" é verde com letra branca, em todas as pilhas', () => {
    for (const c of [CORES_CLARO, CORES_ESCURO]) {
      const cab = cabecalho(c);
      expect(cab.headerStyle.backgroundColor).toBe('#0B5D45');
      expect(contraste(cab.headerTintColor, cab.headerStyle.backgroundColor)).toBeGreaterThanOrEqual(7);
    }
    const separadores = join(__dirname, '../app/(tabs)');
    const pilhas = readdirSync(separadores, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(separadores, d.name, '_layout.tsx'));
    expect(pilhas.length).toBeGreaterThanOrEqual(5);
    for (const f of pilhas) expect(readFileSync(f, 'utf8')).toContain('...cabecalho(CORES)');
  });

  test('nenhum ecrã usa cores fixas da paleta clara (todos seguem o modo)', () => {
    const raiz = join(__dirname, '..');
    const ficheiros: string[] = [];
    const andar = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) andar(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.|__tests__|testes/.test(p)) ficheiros.push(p);
      }
    };
    andar(raiz);
    const errados = ficheiros.filter((f) => /\bCORES_CLARO\b|\bCORES_ESCURO\b/.test(readFileSync(f, 'utf8')) && !/components\/tema(App)?\.tsx?$/.test(f));
    expect(errados).toEqual([]);
  });
});
