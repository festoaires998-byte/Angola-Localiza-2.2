import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

let mockSeparadores: string[] = ['inicio', 'mapa', 'guardados', 'entrega', 'minhas-entregas', 'definicoes'];
jest.mock('@/hooks/useSessao', () => ({
  useSessao: () => ({ utilizador: { id: 'u-1', email: 'ana@exemplo.ao', nome: 'Ana Maria Silva' }, acesso: { separadores: mockSeparadores } }),
}));
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => true }));
let mockMoradas: unknown[] = [];
jest.mock('@/hooks/useMoradas', () => ({ useMoradas: () => ({ itens: mockMoradas, aAtualizar: false }) }));
const mockListar = jest.fn(async () => ({ envios: [] as unknown[], doServidor: true, erro: null }));
jest.mock('@/services/entregas/enviosApp', () => ({ servicoEnvios: { listar: () => mockListar() } }));

import Inicio, { atalhosPara, envioEmCurso, primeiroNome, progressoEnvio, saudacao } from '@/app/(tabs)/inicio';
import type { Envio } from '@/domain/entregas/envio';

const envio = (estado: string, extra: Partial<Envio> = {}) => ({ id: `e-${estado}`, codigo: 'AL-7Q4K', estado, destinatario: 'João', ...extra }) as Envio;

beforeEach(() => {
  mockPush.mockClear();
  mockListar.mockClear();
  mockSeparadores = ['inicio', 'mapa', 'guardados', 'entrega', 'minhas-entregas', 'definicoes'];
  mockMoradas = [];
  mockListar.mockResolvedValue({ envios: [], doServidor: true, erro: null });
});

describe('Início: regras', () => {
  test('saudação pela hora', () => {
    expect(saudacao(7)).toBe('Bom dia');
    expect(saudacao(13)).toBe('Boa tarde');
    expect(saudacao(21)).toBe('Boa noite');
    expect(saudacao(2)).toBe('Boa noite');
  });

  test('só o primeiro nome', () => {
    expect(primeiroNome('  Ana   Maria Silva ')).toBe('Ana');
    expect(primeiroNome(null)).toBeNull();
  });

  test('progresso do envio pelos passos', () => {
    expect(progressoEnvio('CREATED')).toEqual({ passo: 0, fracao: 0.08 });
    expect(progressoEnvio('PICKED_UP').passo).toBe(1);
    expect(progressoEnvio('IN_TRANSIT').passo).toBe(2);
    expect(progressoEnvio('DELIVERED')).toEqual({ passo: 3, fracao: 1 });
  });

  test('o envio em curso é o mais recente que não acabou', () => {
    expect(envioEmCurso([envio('DELIVERED'), envio('IN_TRANSIT'), envio('CREATED')])?.estado).toBe('IN_TRANSIT');
    expect(envioEmCurso([envio('CANCELLED')])).toBeNull();
    expect(envioEmCurso(null)).toBeNull();
  });

  test('os atalhos seguem os separadores de cada pessoa (no máximo 4)', () => {
    expect(atalhosPara(['inicio', 'mapa', 'guardados', 'entrega', 'minhas-entregas', 'definicoes']).map((a) => a.nome))
      .toEqual(['Onde estou', 'Guardar local', 'Enviar', 'Entregas']);
    expect(atalhosPara(['inicio', 'mapa', 'definicoes']).map((a) => a.nome)).toEqual(['Onde estou']);
    expect(atalhosPara(['inicio', 'mapa', 'guardados', 'campo', 'definicoes']).map((a) => a.nome))
      .toEqual(['Onde estou', 'Guardar local', 'Campo', 'Moradas']);
  });
});

describe('Início: ecrã', () => {
  test('saúda pelo primeiro nome, mostra o envio a decorrer e as moradas', async () => {
    mockListar.mockResolvedValue({ envios: [envio('IN_TRANSIT')], doServidor: true, erro: null });
    mockMoradas = [{ favorito: { id: 'f-1', nome: 'Casa', categoria: 'casa' }, morada: { codigo_postal: 'HB-0412' } }];
    render(<Inicio />);
    expect(screen.getByRole('header', { name: 'Ana' })).toBeTruthy();
    expect(await screen.findByText('Envio a decorrer')).toBeTruthy();
    expect(screen.getByText('Em trânsito')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('progresso-envio').props.style).width).toBe('70%');
    expect(screen.getByText('HB-0412')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /^Envio AL-7Q4K/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/entrega/[id]', params: { id: 'e-IN_TRANSIT' } });
    fireEvent.press(screen.getByRole('button', { name: 'Casa' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guardados/[id]', params: { id: 'f-1' } });
  });

  test('atalhos e pesquisa levam ao sítio certo', async () => {
    render(<Inicio />);
    await act(async () => undefined);
    fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(mockPush).toHaveBeenLastCalledWith('/entrega/novo');
    fireEvent.press(screen.getByRole('search'));
    expect(mockPush).toHaveBeenLastCalledWith('/mapa');
    // Sem moradas: convite para registar a primeira.
    fireEvent.press(screen.getByText('Ainda sem moradas'));
    expect(mockPush).toHaveBeenLastCalledWith('/guardados/registar');
  });

  test('pessoal sem envios nem moradas: só o que pode usar', async () => {
    mockSeparadores = ['inicio', 'mapa', 'definicoes'];
    render(<Inicio />);
    await act(async () => undefined);
    expect(screen.queryByText('As minhas moradas')).toBeNull();
    expect(screen.queryByText('Envio a decorrer')).toBeNull();
    expect(mockListar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Onde estou' })).toBeTruthy();
  });
});
