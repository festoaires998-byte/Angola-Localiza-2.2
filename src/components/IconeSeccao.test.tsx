import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import { CabecalhoCartao } from './ui';
import type { NomeSeccao } from './IconeSeccao';
import { PASTILHAS_CLARO as PASTILHAS } from './tema';

const NOMES = (readFileSync(join(__dirname, 'IconeSeccao.tsx'), 'utf8').match(/export type NomeSeccao =([^;]+);/)?.[1] ?? '')
  .match(/'([a-z]+)'/g)!.map((n) => n.slice(1, -1)) as NomeSeccao[];

describe('ícones das secções', () => {
  test('cada ícone desenha-se (e não cai no ícone de ajuda por engano)', () => {
    expect(NOMES.length).toBeGreaterThanOrEqual(20);
    const fonte = readFileSync(join(__dirname, 'IconeSeccao.tsx'), 'utf8');
    for (const nome of NOMES) {
      if (nome !== 'ajuda') expect(fonte).toContain(`'${nome}'`);
      render(<CabecalhoCartao titulo={`Secção ${nome}`} icone={nome} cor="verde" />);
      expect(screen.getByRole('header', { name: `Secção ${nome}` })).toBeTruthy();
    }
  });

  test('a pastilha usa o fundo da cor pedida', () => {
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    const r = render(<CabecalhoCartao titulo="Para onde?" icone="destino" cor="vermelho" />);
    const fundos = r.UNSAFE_root.findAll((n) => (n.type as unknown) === 'View' && StyleSheet.flatten(n.props.style)?.backgroundColor === PASTILHAS.vermelho[1]);
    expect(fundos.length).toBeGreaterThan(0);
  });
});
