import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

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

type Ecra = { default: () => React.JSX.Element };
const Layout = (require('@/app/(tabs)/admin/_layout') as Ecra).default;
const Lista = (require('@/app/(tabs)/admin/index') as Ecra).default;
const Detalhe = (require('@/app/(tabs)/admin/[id]') as Ecra).default;
const { lojaRevisaoKyc } = require('@/state/revisaoKyc') as typeof import('@/state/revisaoKyc');

let r: ReturnType<typeof renderRouter>;
/** O separador Admin com o Stack verdadeiro: lista em /admin, detalhe em /admin/<id>. */
async function desenhar() {
  r = renderRouter({ 'admin/_layout': Layout, 'admin/index': Lista, 'admin/[id]': Detalhe }, { initialUrl: '/admin' });
  await act(async () => {});
}
/** Aprova carregando em "Aprovar" e depois no botão do alerta do sistema. */
async function aprovarNoAlerta(alerta: jest.SpiedFunction<typeof Alert.alert>, botao = 'Aprovar') {
  const botoes = alerta.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    botoes.find((b) => b.text === botao)?.onPress?.();
  });
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
  lojaRevisaoKyc.definir({ pedidos: null, aviso: null });
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

  test('rever abre um ecrã próprio (/admin/<id>); Voltar regressa à lista tal como estava', async () => {
    await desenhar();
    await carregar('Rever Ana Silva');
    expect(r.getPathname()).toBe('/admin/aaaaaaaa-1111-4111-8111-111111111111');
    expect(screen.getByText('Ana Silva')).toBeTruthy();
    expect(screen.queryByText('bento@exemplo.ao')).toBeNull();
    await act(async () => {
      router.back();
    });
    await waitFor(() => expect(r.getPathname()).toBe('/admin'));
    // A lista não foi pedida outra vez: é a mesma, com os dois pedidos.
    expect(mockListar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ana Silva')).toBeTruthy();
    expect(screen.getByText('bento@exemplo.ao')).toBeTruthy();
  });

  test('rever: mostra as 3 fotos (descarregadas para a memória) e aprova com o alerta do sistema', async () => {
    const alerta = jest.spyOn(Alert, 'alert');
    await desenhar();
    await carregar('Rever Ana Silva');
    expect(mockLerFoto).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Foto: BI — frente').props.source).toEqual({ uri: expect.stringMatching(/^data:image\/jpeg;base64,/) });
    expect(screen.getByLabelText('Foto: BI — verso')).toBeTruthy();
    expect(screen.getByLabelText('Foto: Selfies (normal e com o gesto)')).toBeTruthy();

    await carregar('Aprovar');
    // Pede confirmação num alerta do sistema (não aprova logo).
    expect(alerta).toHaveBeenCalledWith('Aprovar a verificação?', expect.stringContaining('Ana Silva'), expect.any(Array), { cancelable: true });
    expect(mockDecidir).not.toHaveBeenCalled();
    // "Cancelar" não faz nada.
    await aprovarNoAlerta(alerta, 'Cancelar');
    expect(mockDecidir).not.toHaveBeenCalled();

    await carregar('Aprovar');
    await aprovarNoAlerta(alerta);
    expect(mockDecidir).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111', { aprovar: true });
    // Volta à lista, com o aviso, e o pedido sai dela.
    await waitFor(() => expect(r.getPathname()).toBe('/admin'));
    expect(screen.getByText(/Verificação de Ana Silva aprovada ✅/)).toBeTruthy();
    expect(screen.queryByText('Rever Ana Silva')).toBeNull();
    expect(screen.getByText('bento@exemplo.ao')).toBeTruthy();
    alerta.mockRestore();
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
    await waitFor(() => expect(r.getPathname()).toBe('/admin'));
    expect(screen.getByText(/Verificação de bento@exemplo.ao recusada/)).toBeTruthy();
  });

  test('se o servidor recusar a decisão, mostra o erro e fica no pedido', async () => {
    mockDecidir.mockRejectedValueOnce(new Error('este pedido nao esta por rever'));
    const alerta = jest.spyOn(Alert, 'alert');
    await desenhar();
    await carregar('Rever Ana Silva');
    await carregar('Aprovar');
    await aprovarNoAlerta(alerta);
    expect(screen.getByText('Não foi possível guardar a decisão: este pedido nao esta por rever')).toBeTruthy();
    expect(r.getPathname()).toBe('/admin/aaaaaaaa-1111-4111-8111-111111111111');
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeTruthy();
    alerta.mockRestore();
  });

  test('abrir por link um pedido que já não está na lista: explica e deixa voltar', async () => {
    r = renderRouter({ 'admin/_layout': Layout, 'admin/index': Lista, 'admin/[id]': Detalhe }, {
      initialUrl: '/admin/99999999-9999-4999-8999-999999999999',
    });
    await act(async () => {});
    expect(screen.getByText(/Este pedido já não está na lista/)).toBeTruthy();
    expect(mockAbrirFotos).not.toHaveBeenCalled();
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
