import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { FotosKyc, PedidoKyc } from '@/domain/identidade/revisaoKyc';

const pedido = (userId: string, extra: Partial<PedidoKyc> = {}): PedidoKyc => ({
  userId,
  enviadoEm: '2026-09-24T09:00:00Z',
  email: null,
  nome: null,
  telefone: null,
  ...extra,
});
const fotos = (userId: string, extra: Partial<FotosKyc> = {}): FotosKyc => ({
  frente: `https://arquivo/${userId}/frente?token=t`,
  verso: `https://arquivo/${userId}/verso?token=t`,
  selfie: `https://arquivo/${userId}/selfie?token=t`,
  ...extra,
});

let mockPedidos: PedidoKyc[] = [];
const mockListar = jest.fn(async () => mockPedidos);
const mockDecidir = jest.fn(async (_u: string, _d: unknown) => undefined);
const mockAbrirFotos = jest.fn(async (u: string): Promise<FotosKyc> => fotos(u));
const mockLerFoto = jest.fn(async (url: string) => `data:image/jpeg;base64,${url.length}`);
jest.mock('@/api/revisaoKyc', () => ({
  listarPedidosKyc: () => mockListar(),
  decidirPedidoKyc: (u: string, d: unknown) => mockDecidir(u, d),
  abrirFotosKyc: (u: string) => mockAbrirFotos(u),
  lerFotoKyc: (url: string) => mockLerFoto(url),
}));

let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
let mockCargos: string[] = ['admin_municipal'];
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ perfil: { cargos: mockCargos } }) }));

const Admin = (require('@/app/(tabs)/admin') as { default: () => React.JSX.Element }).default;

async function desenhar() {
  render(<Admin />);
  await act(async () => {});
}
async function carregar(nome: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: nome }));
  });
}

beforeEach(() => {
  mockPedidos = [
    pedido('aaaaaaaa-1111-4111-8111-111111111111', { nome: 'Ana Silva', email: 'ana@exemplo.ao', telefone: '+244923000000' }),
    pedido('bbbbbbbb-2222-4222-8222-222222222222', { email: 'bento@exemplo.ao' }),
  ];
  mockOnline = true;
  mockCargos = ['admin_municipal'];
  [mockListar, mockDecidir, mockLerFoto, mockAbrirFotos].forEach((f) => f.mockClear());
});

describe('Admin: verificações por rever', () => {
  test('lista os pedidos com o nome/email, o telefone e o id (para o administrador saber quem é)', async () => {
    await desenhar();
    expect(mockListar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ana Silva')).toBeTruthy();
    expect(screen.getByText('Email: ana@exemplo.ao')).toBeTruthy();
    expect(screen.getByText('Telefone: +244923000000')).toBeTruthy();
    expect(screen.getByText('Id: aaaaaaaa')).toBeTruthy();
    // Sem nome: o email é o título.
    expect(screen.getByText('bento@exemplo.ao')).toBeTruthy();
    expect(screen.getByText('Id: bbbbbbbb')).toBeTruthy();
  });

  test('conta sem nome nem email: mostra o id curto', async () => {
    mockPedidos = [pedido('cccccccc-3333-4333-8333-333333333333')];
    await desenhar();
    expect(screen.getByText('Cidadão cccccccc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rever Cidadão cccccccc' })).toBeTruthy();
  });

  test('sem pedidos: diz que não há nada', async () => {
    mockPedidos = [];
    await desenhar();
    expect(screen.getByText(/Não há verificações por rever/)).toBeTruthy();
  });

  test('o auditor vê o separador mas não pode rever (nem pede a lista)', async () => {
    mockCargos = ['auditor'];
    await desenhar();
    expect(screen.getByText(/Só os administradores podem aprovar ou recusar/)).toBeTruthy();
    expect(mockListar).not.toHaveBeenCalled();
  });

  test('sem rede: explica e não pede nada', async () => {
    mockOnline = false;
    await desenhar();
    expect(screen.getByText(/Sem rede\. A revisão das verificações precisa de rede/)).toBeTruthy();
    expect(mockListar).not.toHaveBeenCalled();
  });

  test('erro do servidor aparece', async () => {
    mockListar.mockRejectedValueOnce(new Error('apenas administradores'));
    await desenhar();
    expect(screen.getByText('Não foi possível ler os pedidos: apenas administradores')).toBeTruthy();
  });

  test('rever: mostra as 3 fotos (descarregadas para a memória) e aprova com confirmação', async () => {
    await desenhar();
    await carregar('Rever Ana Silva');
    expect(mockLerFoto).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Foto: BI — frente').props.source).toEqual({ uri: expect.stringMatching(/^data:image\/jpeg;base64,/) });
    expect(screen.getByLabelText('Foto: BI — verso')).toBeTruthy();
    expect(screen.getByLabelText('Foto: Selfies (normal e com o gesto)')).toBeTruthy();

    await carregar('Aprovar');
    expect(mockDecidir).not.toHaveBeenCalled(); // precisa de confirmar
    await carregar('Sim, aprovar');
    expect(mockDecidir).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111', { aprovar: true });
    expect(screen.getByText(/Verificação de Ana Silva aprovada ✅/)).toBeTruthy();
    // Sai da lista.
    expect(screen.queryByText('Ana Silva')).toBeNull();
    expect(screen.getByText('bento@exemplo.ao')).toBeTruthy();
  });

  test('recusar exige motivo; um motivo rápido preenche-o', async () => {
    await desenhar();
    await carregar('Rever bento@exemplo.ao');
    await carregar('Recusar');
    const recusar = () => screen.getByRole('button', { name: 'Recusar a verificação' });
    expect(recusar().props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Motivo da recusa'), 'ab');
    expect(screen.getByText(/Escreve o motivo da recusa/)).toBeTruthy();
    expect(recusar().props.accessibilityState.disabled).toBe(true);

    await carregar('Motivo: A foto do BI está desfocada ou ilegível.');
    expect(recusar().props.accessibilityState.disabled).toBe(false);
    await carregar('Recusar a verificação');
    expect(mockDecidir).toHaveBeenCalledWith('bbbbbbbb-2222-4222-8222-222222222222', {
      aprovar: false,
      motivo: 'A foto do BI está desfocada ou ilegível.',
    });
    expect(screen.getByText(/Verificação de bento@exemplo.ao recusada/)).toBeTruthy();
  });

  test('se o servidor recusar a decisão, mostra o erro e fica no pedido', async () => {
    mockDecidir.mockRejectedValueOnce(new Error('este pedido nao esta por rever'));
    await desenhar();
    await carregar('Rever Ana Silva');
    await carregar('Aprovar');
    await carregar('Sim, aprovar');
    expect(screen.getByText('Não foi possível guardar a decisão: este pedido nao esta por rever')).toBeTruthy();
    expect(screen.getByText('Ana Silva')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sim, aprovar' })).toBeTruthy();
  });

  test('as fotos só se pedem ao abrir um pedido (a abertura fica registada no servidor), não na lista', async () => {
    await desenhar();
    expect(mockAbrirFotos).not.toHaveBeenCalled();
    await carregar('Rever Ana Silva');
    expect(mockAbrirFotos).toHaveBeenCalledTimes(1);
    expect(mockAbrirFotos).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111');
  });

  test('foto em falta ou que não abre: avisa e pede links novos (nova abertura)', async () => {
    const id = 'aaaaaaaa-1111-4111-8111-111111111111';
    mockPedidos = [pedido(id, { nome: 'Ana Silva' })];
    mockAbrirFotos.mockResolvedValueOnce(fotos(id, { verso: null }));
    mockLerFoto.mockRejectedValueOnce(new Error('O link da foto expirou.'));
    await desenhar();
    await carregar('Rever Ana Silva');
    expect(screen.getByText('Esta foto não está no arquivo.')).toBeTruthy();
    expect(screen.getByText('A foto não abriu: O link da foto expirou.')).toBeTruthy();
    await carregar('Pedir links novos');
    expect(mockAbrirFotos).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Foto: BI — frente')).toBeTruthy();
  });

  test('o servidor não entrega as fotos (ex.: já decidido por outro administrador): mostra o erro e deixa tentar de novo', async () => {
    mockAbrirFotos.mockRejectedValueOnce(new Error('este pedido nao esta por rever'));
    await desenhar();
    await carregar('Rever Ana Silva');
    expect(screen.getByText('Não foi possível abrir as fotos: este pedido nao esta por rever')).toBeTruthy();
    await carregar('Tentar de novo');
    expect(mockAbrirFotos).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Foto: BI — verso')).toBeTruthy();
  });
});
