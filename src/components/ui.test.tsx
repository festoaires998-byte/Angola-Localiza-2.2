import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

import * as Haptics from 'expo-haptics';

import { IlustracaoVazio } from './IlustracaoVazio';
import { Botao, Cartao, Texto, Titulo, vibrarSucesso } from './ui';

beforeEach(() => { jest.clearAllMocks(); });

describe('componentes base modernos', () => {
  test('o botão vibra ao tocar e depois faz a ação', () => {
    const acao = jest.fn();
    render(<Botao titulo="Guardar" onPress={acao} />);
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(acao).toHaveBeenCalledTimes(1);
  });

  test('um botão desativado não vibra nem faz nada', () => {
    const acao = jest.fn();
    render(<Botao titulo="Guardar" onPress={acao} desativado />);
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(acao).not.toHaveBeenCalled();
  });

  test('vibração de sucesso', () => {
    vibrarSucesso();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  test('o botão usa a letra da app', () => {
    render(<Botao titulo="Entrar" onPress={() => undefined} />);
    const texto = screen.getByText('Entrar');
    expect(StyleSheet.flatten(texto.props.style).fontFamily).toBe('PlusJakartaSans_800ExtraBold');
  });

  test('cartão com cantos redondos e sombra; título em faixa verde', () => {
    render(<><Cartao><Texto>Dentro do cartão</Texto></Cartao><Titulo>Conta</Titulo></>);
    // Sobe da letra até à primeira View com cantos redondos: o cartão.
    let no = screen.getByText('Dentro do cartão').parent;
    while (no && !StyleSheet.flatten(no.props.style)?.borderRadius) no = no.parent;
    const cartao = StyleSheet.flatten(no!.props.style);
    expect(cartao.borderRadius).toBe(20);
    expect(cartao.elevation).toBeGreaterThan(0);
    let f = screen.getByRole('header', { name: 'Conta' }).parent;
    while (f && !StyleSheet.flatten(f.props.style)?.backgroundColor) f = f.parent;
    const faixa = StyleSheet.flatten(f!.props.style);
    expect(faixa.backgroundColor).toBe('#0B5D45');
  });

  test('desenho dos ecrãs vazios', () => {
    render(<IlustracaoVazio icone="carga" />);
    expect(screen.getByTestId('vazio-carga', { includeHiddenElements: true })).toBeTruthy();
  });
});
