import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { LinhaTempo } from './LinhaTempo';

describe('LinhaTempo', () => {
  test('mostra os passos e lê cada um em voz alta com o estado', () => {
    render(<LinhaTempo estado="PICKED_UP" />);
    expect(screen.getByLabelText('Recolhida: passo atual. A encomenda está com o estafeta')).toBeTruthy();
    expect(screen.getByLabelText('Pedido criado: feito')).toBeTruthy();
    expect(screen.getByLabelText('Entregue: ainda não')).toBeTruthy();
    expect(screen.getAllByTestId('passo-feito', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getAllByTestId('passo-agora', { includeHiddenElements: true })).toHaveLength(1);
  });
});
