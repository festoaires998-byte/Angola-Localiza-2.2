import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockApagar = jest.fn(async (_u: string, _c: string): Promise<{ ok: true } | { ok: false; erro: string }> => ({ ok: true }));
jest.mock('@/services/conta/apagarContaApp', () => ({ apagarConta: (u: string, c: string) => mockApagar(u, c) }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: 'ana' } }) }));
let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));

const ApagarConta = (require('@/app/(tabs)/definicoes/apagar-conta') as { default: () => React.JSX.Element }).default;
const desativado = () => screen.getByRole('button', { name: 'Apagar a minha conta' }).props.accessibilityState.disabled;

beforeEach(() => {
  mockOnline = true;
  mockApagar.mockClear();
});

describe('ecrã Apagar a minha conta', () => {
  test('explica o que é apagado e o que fica; só deixa apagar depois de escrever APAGAR', async () => {
    render(<ApagarConta />);
    expect(screen.getByText(/não tem volta atrás/)).toBeTruthy();
    expect(screen.getByText(/As entregas e as provas de entrega/)).toBeTruthy();
    expect(desativado()).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Para confirmar, escreve APAGAR'), 'apaga');
    expect(desativado()).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Para confirmar, escreve APAGAR'), 'apagar');
    expect(desativado()).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Apagar a minha conta' }));
    });
    expect(mockApagar).toHaveBeenCalledWith('ana', 'apagar');
  });

  test('erro do servidor aparece em palavras simples', async () => {
    mockApagar.mockResolvedValueOnce({ ok: false, erro: 'Sem ligação ao servidor. Para apagar a conta precisas de rede.' });
    render(<ApagarConta />);
    fireEvent.changeText(screen.getByLabelText('Para confirmar, escreve APAGAR'), 'APAGAR');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Apagar a minha conta' }));
    });
    expect(screen.getByText(/precisas de rede/)).toBeTruthy();
  });

  test('sem rede o botão fica desligado e explica porquê', () => {
    mockOnline = false;
    render(<ApagarConta />);
    fireEvent.changeText(screen.getByLabelText('Para confirmar, escreve APAGAR'), 'APAGAR');
    expect(desativado()).toBe(true);
    expect(screen.getByText('Para apagar a conta precisas de rede.')).toBeTruthy();
  });
});
