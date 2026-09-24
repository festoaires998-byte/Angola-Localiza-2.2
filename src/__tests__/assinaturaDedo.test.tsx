import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AssinaturaDedo } from '@/components/AssinaturaDedo';

describe('AssinaturaDedo', () => {
  test('sem traços não deixa confirmar nem limpar', () => {
    render(<AssinaturaDedo assinatura={null} aoConfirmar={async () => undefined} aoApagar={() => undefined} />);
    expect(screen.getByText('Pede a quem recebe para assinar no quadro com o dedo.')).toBeTruthy();
    expect(screen.getByTestId('quadro-assinatura')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar a assinatura' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Limpar' }).props.accessibilityState.disabled).toBe(true);
  });

  test('com a assinatura gravada mostra-a e deixa assinar de novo', async () => {
    const apagar = jest.fn();
    render(<AssinaturaDedo assinatura="file:///assinatura.png" aoConfirmar={async () => undefined} aoApagar={apagar} />);
    expect(screen.getByLabelText('Assinatura de quem recebe')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Assinar de novo' }));
    });
    expect(apagar).toHaveBeenCalled();
  });
});
