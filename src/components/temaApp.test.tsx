import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => mem.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { mem.set(k, v); }),
  };
});

import { carregarPreferenciaTema, escolherTema, preferenciaTema } from '@/state/tema';

import { CORES_CLARO, CORES_ESCURO, FONTES, type Cores } from './tema';
import { comLetra, esquemaEfetivo, estilosPara, ProvedorTema, useCores, useEstilos } from './temaApp';

const fabrica = (c: Cores) => StyleSheet.create({ caixa: { backgroundColor: c.fundo }, titulo: { fontSize: 20, fontWeight: '800', color: c.texto } });

function Amostra() {
  const cores = useCores();
  const estilos = useEstilos(fabrica);
  return <Text testID="amostra" style={estilos.titulo}>{cores.fundo}</Text>;
}

afterEach(async () => { await act(async () => { await escolherTema('auto'); }); });

describe('modo claro/escuro', () => {
  test('"Automático" segue o telemóvel; Claro e Escuro mandam', () => {
    expect(esquemaEfetivo('auto', 'dark')).toBe('escuro');
    expect(esquemaEfetivo('auto', 'light')).toBe('claro');
    expect(esquemaEfetivo('auto', null)).toBe('claro');
    expect(esquemaEfetivo('claro', 'dark')).toBe('claro');
    expect(esquemaEfetivo('escuro', 'light')).toBe('escuro');
  });

  test('a escolha fica guardada e uma escolha estranha volta a "Automático"', async () => {
    await escolherTema('escuro');
    expect(preferenciaTema()).toBe('escuro');
    expect(await carregarPreferenciaTema()).toBe('escuro');
    await escolherTema('roxo' as never);
    expect(preferenciaTema()).toBe('escuro');
  });

  test('o ecrã muda de cores na hora, sem reabrir a app', async () => {
    render(<ProvedorTema><Amostra /></ProvedorTema>);
    expect(screen.getByTestId('amostra').props.children).toBe(CORES_CLARO.fundo);
    await act(async () => { await escolherTema('escuro'); });
    expect(screen.getByTestId('amostra').props.children).toBe(CORES_ESCURO.fundo);
    expect(StyleSheet.flatten(screen.getByTestId('amostra').props.style).color).toBe(CORES_ESCURO.texto);
  });

  test('os estilos fazem-se uma vez por modo', () => {
    expect(estilosPara(fabrica, 'claro')).toBe(estilosPara(fabrica, 'claro'));
    expect(estilosPara(fabrica, 'escuro').caixa.backgroundColor).toBe(CORES_ESCURO.fundo);
    expect(estilosPara(fabrica, 'claro').caixa.backgroundColor).toBe(CORES_CLARO.fundo);
  });
});

describe('letra da app', () => {
  test('o peso escolhe o ficheiro de letra e o fontWeight sai', () => {
    const e = comLetra({ a: { fontSize: 18, fontWeight: '800' as const }, b: { fontSize: 14 }, c: { fontFamily: 'Outra', fontSize: 12 }, d: { padding: 4 } });
    expect(e.a).toEqual({ fontSize: 18, fontFamily: FONTES.extra });
    expect(e.b).toEqual({ fontSize: 14, fontFamily: FONTES.normal });
    expect(e.c).toEqual({ fontFamily: 'Outra', fontSize: 12 });
    expect(e.d).toEqual({ padding: 4 });
  });
});
