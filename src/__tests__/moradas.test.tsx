import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Favorito } from '@/database/repositories/favoritos';
import type { Morada } from '@/database/repositories/moradas';
import type { ItemMorada } from '@/services/moradas/moradas';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockId = 'f1';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: mockId }),
}));

const mockCopiar = jest.fn(async (_t: string) => true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (t: string) => mockCopiar(t) }));

let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));

const mockAtualizar = jest.fn(async () => undefined);
const mockAlterar = jest.fn(async (_id: string, _m: unknown) => undefined);
const mockRemover = jest.fn(async (_id: string) => undefined);
let mockEstado: Record<string, unknown> = {};
jest.mock('@/hooks/useMoradas', () => ({
  useMoradas: () => ({
    aAtualizar: false,
    erro: null,
    atualizadoEm: null,
    pendentes: 0,
    atualizar: mockAtualizar,
    alterar: mockAlterar,
    remover: mockRemover,
    ...mockEstado,
  }),
}));

const Lista = (require('@/app/(tabs)/guardados/index') as { default: () => React.JSX.Element }).default;
const Detalhe = (require('@/app/(tabs)/guardados/[id]') as { default: () => React.JSX.Element }).default;

function morada(id: string, extra: Partial<Morada> = {}): Morada {
  return {
    id,
    plus_code: '5FVQ5PWV+PH5',
    codigo_postal: 'AO-HUA-MNFQPN2S-3-95',
    latitude: -12.7761,
    longitude: 15.7392,
    precisao_m: 4,
    provincia: 'Huambo',
    municipio: 'Huambo',
    estado: 'PROPOSED',
    origem: 'servidor',
    dados: { referencia: 'Portão azul', numero_porta: null, visibilidade: 'PUBLIC', criada_em: '2026-09-20T10:00:00.000Z' },
    atualizado_em: '2026-09-21T10:00:00.000Z',
    ...extra,
  };
}

function item(id: string, fav: Partial<Favorito> = {}, m: Partial<Morada> = {}): ItemMorada {
  return {
    favorito: {
      id,
      user_id: 'user-1',
      morada_id: `m-${id}`,
      nome: '',
      categoria: 'casa',
      pendente: null,
      criado_em: '2026-09-20T10:00:00.000Z',
      atualizado_em: '2026-09-24T08:00:00.000Z',
      ...fav,
    },
    morada: morada(`m-${id}`, m),
  };
}

function desenhar(Ecra: () => React.JSX.Element) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Ecra />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockOnline = true;
  mockId = 'f1';
  mockEstado = {
    itens: [
      item('f1'),
      item('f2', { nome: 'Escritório', categoria: 'trabalho' }, { codigo_postal: 'AO-HUA-MNFQPN44-2-59', municipio: 'Caála' }),
    ],
  };
  [mockPush, mockBack, mockCopiar, mockAtualizar, mockAlterar, mockRemover].forEach((f) => f.mockClear());
});

describe('Moradas: lista', () => {
  test('mostra as moradas com código, sítio, categoria e estado', () => {
    desenhar(Lista);
    expect(screen.getByText('As minhas moradas')).toBeTruthy();
    // Sem nome: o código é o título. Com nome: o nome e o código por baixo.
    expect(screen.getByText('AO-HUA-MNFQPN2S-3-95')).toBeTruthy();
    expect(screen.getByText('Escritório')).toBeTruthy();
    expect(screen.getByText('AO-HUA-MNFQPN44-2-59')).toBeTruthy();
    expect(screen.getByText('Caála, Huambo')).toBeTruthy();
    expect(screen.getAllByText('Proposta (à espera de validação)')).toHaveLength(2);
  });

  test('filtrar por categoria', () => {
    desenhar(Lista);
    fireEvent.press(screen.getByRole('button', { name: 'Categoria: Trabalho' }));
    expect(screen.queryByText('AO-HUA-MNFQPN2S-3-95')).toBeNull();
    expect(screen.getByText('Escritório')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Categoria: Loja' }));
    expect(screen.getByText('Sem moradas na categoria Loja.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Categoria: Todas' }));
    expect(screen.getByText('AO-HUA-MNFQPN2S-3-95')).toBeTruthy();
  });

  test('carregar numa morada abre o detalhe', () => {
    desenhar(Lista);
    fireEvent.press(screen.getByRole('button', { name: 'Escritório. Trabalho' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guardados/[id]', params: { id: 'f2' } });
  });

  test('sem rede: diz que mostra o que está no telemóvel e quando foi atualizado', () => {
    mockOnline = false;
    mockEstado = { ...mockEstado, atualizadoEm: '2026-09-24T08:00:00.000Z', pendentes: 1 };
    desenhar(Lista);
    expect(screen.getByText(/Sem rede: a mostrar o que está neste telemóvel \(atualizado a /)).toBeTruthy();
    expect(screen.getByText('1 alteração à espera de rede para ir para o servidor.')).toBeTruthy();
  });

  test('sem moradas: explica que por agora se guardam no site', () => {
    mockEstado = { itens: [] };
    desenhar(Lista);
    expect(screen.getByText('Ainda não tens moradas guardadas.')).toBeTruthy();
    expect(screen.getByText(/as moradas guardam-se no site/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Categoria: Todas' })).toBeNull();
  });

  test('alteração à espera de rede aparece na morada', () => {
    mockEstado = { itens: [item('f1', { pendente: 'atualizar' })] };
    desenhar(Lista);
    expect(screen.getByText('À espera de rede')).toBeTruthy();
  });
});

describe('Moradas: detalhe', () => {
  test('mostra tudo o que se sabe da morada', () => {
    desenhar(Detalhe);
    expect(screen.getAllByText('AO-HUA-MNFQPN2S-3-95').length).toBeGreaterThan(0);
    expect(screen.getByText('5FVQ5PWV+PH5')).toBeTruthy();
    expect(screen.getByText('Portão azul')).toBeTruthy();
    expect(screen.getByText('Pública (visível a todos no link/cartão)')).toBeTruthy();
    expect(screen.getByText('-12.776100, 15.739200')).toBeTruthy();
    expect(screen.getByText('± 4 m')).toBeTruthy();
  });

  test('copiar e partilhar o código', async () => {
    const partilha = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    desenhar(Detalhe);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copiar código' }));
    });
    expect(mockCopiar).toHaveBeenCalledWith('AO-HUA-MNFQPN2S-3-95');
    expect(screen.getByRole('button', { name: 'Código copiado ✓' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Partilhar' }));
    expect(partilha).toHaveBeenCalledWith({
      message:
        'Código Postal Digital: AO-HUA-MNFQPN2S-3-95\nPlus Code: 5FVQ5PWV+PH5\nMapa: https://www.google.com/maps?q=-12.7761,15.7392',
    });
    partilha.mockRestore();
  });

  test('mudar nome e categoria: guarda (sem rede fica no telemóvel)', async () => {
    mockOnline = false;
    desenhar(Detalhe);
    expect(screen.getByRole('button', { name: 'Guardar alterações' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Nome (opcional, ex.: Casa da avó)'), 'Casa da avó');
    fireEvent.press(screen.getByRole('button', { name: 'Categoria: Família' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar alterações' }));
    });
    expect(mockAlterar).toHaveBeenCalledWith('f1', { nome: 'Casa da avó', categoria: 'familia' });
    expect(screen.getByText('Guardado neste telemóvel. Vai para o servidor quando houver rede.')).toBeTruthy();
  });

  test('tirar das moradas guardadas pede confirmação', async () => {
    const alerta = jest.spyOn(Alert, 'alert');
    desenhar(Detalhe);
    fireEvent.press(screen.getByRole('button', { name: 'Tirar das moradas guardadas' }));
    const botoes = alerta.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(mockRemover).not.toHaveBeenCalled();
    await act(async () => {
      botoes.find((b) => b.text === 'Tirar')!.onPress!();
    });
    expect(mockRemover).toHaveBeenCalledWith('f1');
    expect(mockBack).toHaveBeenCalled();
    alerta.mockRestore();
  });

  test('morada que já não está na lista', () => {
    mockId = 'nao-existe';
    desenhar(Detalhe);
    expect(screen.getByText('Esta morada já não está nas tuas moradas guardadas.')).toBeTruthy();
  });
});
