import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { DadosEnvio, Envio, PinEnvio } from '@/domain/entregas/envio';
import type { ResultadoEnvio } from '@/services/entregas/envios';

const EU = 'aaaaaaaa-0000-4000-8000-000000000001';
const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';

const envio = (id: string, extra: Partial<Envio> = {}): Envio => ({
  id,
  codigo: `RAST${id}`,
  estado: 'CREATED',
  destinatario: 'Maria João',
  telefone: '+244 923 456 789',
  instrucoes: null,
  urgente: false,
  criadoPor: EU,
  estafeta: null,
  atualizadoEm: '2026-09-24T10:00:00.000Z',
  morada: { codigoPostal: 'AO-HUA-23456789-42', plusCode: null, referencia: null },
  ...extra,
});
const PIN: PinEnvio = { pin: '4821', expiraEm: '2026-09-27T10:00:00.000Z', bloqueado: false };

let mockEnvios: Envio[] = [];
let mockPorEnviar: { operationId: string; destinatario: string; criadoEm: string; erro: string | null }[] = [];
const mockEnviar = jest.fn(async (_u: string, _d: DadosEnvio, _o: boolean): Promise<ResultadoEnvio> => ({ tipo: 'enviado', envio: envio('n1'), pin: PIN }));
const mockLerPin = jest.fn(async (_id: string) => PIN);
const mockGerarPin = jest.fn(async (_id: string): Promise<PinEnvio> => ({ ...PIN, pin: '1357' }));
const mockCancelar = jest.fn(async (e: Envio) => ({ ...e, estado: 'CANCELLED' }));
jest.mock('@/services/entregas/enviosApp', () => ({
  servicoEnvios: {
    listar: async () => ({ envios: mockEnvios, doServidor: true, erro: null }),
    porEnviar: async () => mockPorEnviar,
    enviar: (u: string, d: DadosEnvio, o: boolean) => mockEnviar(u, d, o),
    lerPin: (id: string) => mockLerPin(id),
    gerarPin: (id: string) => mockGerarPin(id),
    cancelar: (e: Envio) => mockCancelar(e),
  },
}));

let mockVerificacao = 'verificado';
jest.mock('@/services/moradas/registoApp', () => ({
  servicoRegisto: { verificacao: async () => mockVerificacao },
}));

const itemMorada = (id: string, nome: string, origem = 'servidor') => ({
  favorito: { id: `fav-${id}`, nome, categoria: 'casa', pendente: null },
  morada: { id, codigo_postal: 'AO-HUA-23456789-42', plus_code: '6GXV+2C', origem },
});
let mockMoradas: unknown[] = [];
jest.mock('@/hooks/useMoradas', () => ({ useMoradas: () => ({ itens: mockMoradas }) }));
let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: EU } }) }));

type Ecra = { default: () => React.JSX.Element };
const Layout = (require('@/app/(tabs)/entrega/_layout') as Ecra).default;
const Lista = (require('@/app/(tabs)/entrega/index') as Ecra).default;
const Novo = (require('@/app/(tabs)/entrega/novo') as Ecra).default;
const Detalhe = (require('@/app/(tabs)/entrega/[id]') as Ecra).default;
const { lojaEnvios, ESTADO_INICIAL_ENVIOS, AVISO_NA_FILA } = require('@/state/envios') as typeof import('@/state/envios');
const Vazio = () => null;

let r: ReturnType<typeof renderRouter>;
async function desenhar(url = '/entrega') {
  r = renderRouter(
    { 'entrega/_layout': Layout, 'entrega/index': Lista, 'entrega/novo': Novo, 'entrega/[id]': Detalhe, 'definicoes/verificacao': Vazio },
    { initialUrl: url },
  );
  await act(async () => {});
}
async function carregar(nome: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: nome }));
  });
}
async function escolherNoAlerta(alerta: jest.SpiedFunction<typeof Alert.alert>, botao: string) {
  const botoes = alerta.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    botoes.find((b) => b.text === botao)?.onPress?.();
  });
}
async function preencherEEnviar() {
  await act(async () => {
    fireEvent.press(screen.getByRole('radio', { name: /Morada de destino: Casa da Maria/ }));
    fireEvent.changeText(screen.getByLabelText('Nome de quem recebe'), 'Maria João');
  });
  await carregar('Rever e confirmar pedido');
  expect(screen.getByText(/Confirma os dados antes de enviar:/)).toBeTruthy();
  await carregar('Confirmar e enviar');
}

beforeEach(() => {
  mockEnvios = [envio('e1'), envio('e2', { estado: 'OUT_FOR_DELIVERY', urgente: true, destinatario: 'Bento' })];
  mockPorEnviar = [];
  mockVerificacao = 'verificado';
  mockMoradas = [itemMorada(MORADA, 'Casa da Maria'), itemMorada('local-1', 'Ainda sem id', 'local')];
  mockOnline = true;
  lojaEnvios.definir(ESTADO_INICIAL_ENVIOS);
  [mockEnviar, mockLerPin, mockGerarPin, mockCancelar].forEach((f) => f.mockClear());
});

describe('Enviar: os meus envios', () => {
  test('lista os envios com o estado, o código de rastreio e "Urgente"', async () => {
    await desenhar();
    expect(screen.getByText('Os meus envios')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Envio para Maria João. À espera de estafeta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Envio para Bento. Saiu para entrega' })).toBeTruthy();
    expect(screen.getByText('Rastreio: RASTe1')).toBeTruthy();
    expect(screen.getByText('Urgente')).toBeTruthy();
  });

  test('sem envios: explica como fazer', async () => {
    mockEnvios = [];
    await desenhar();
    expect(screen.getByText('Ainda não enviaste nada.')).toBeTruthy();
  });

  test('pedidos feitos sem rede aparecem à espera de rede; sem rede avisa', async () => {
    mockOnline = false;
    mockPorEnviar = [{ operationId: 'op-1', destinatario: 'Carla', criadoEm: '2026-09-24T09:00:00.000Z', erro: null }];
    await desenhar();
    expect(screen.getByText('Sem rede: a mostrar o que está neste telemóvel.')).toBeTruthy();
    expect(screen.getByText('1 pedido à espera de rede para ir para o servidor:')).toBeTruthy();
    expect(screen.getByText(/• Carla/)).toBeTruthy();
  });
});

describe('Enviar: novo envio', () => {
  test('identidade por verificar: não deixa enviar e leva à verificação', async () => {
    mockVerificacao = 'por_verificar';
    await desenhar('/entrega/novo');
    expect(screen.getByText('Para enviar, primeiro tens de verificar a tua identidade.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rever e confirmar pedido' })).toBeNull();
    await carregar('Verificar a minha identidade');
    expect(r.getPathname()).toBe('/definicoes/verificacao');
  });

  test('verificação à espera do administrador: explica', async () => {
    mockVerificacao = 'em_revisao';
    await desenhar('/entrega/novo');
    expect(screen.getByText(/à espera de um administrador/)).toBeTruthy();
  });

  test('só mostra moradas que já estão no servidor; a lista "Falta" bloqueia o botão', async () => {
    await desenhar('/entrega/novo');
    expect(screen.getByRole('radio', { name: /Casa da Maria/ })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /Ainda sem id/ })).toBeNull();
    expect(screen.getByText(/Escolher a morada de destino\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rever e confirmar pedido' }).props.accessibilityState.disabled).toBe(true);
  });

  test('sem moradas guardadas: manda guardar primeiro', async () => {
    mockMoradas = [];
    await desenhar('/entrega/novo');
    expect(screen.getByText(/Ainda não tens moradas guardadas/)).toBeTruthy();
  });

  test('com rede: envia e abre o detalhe com o PIN em grande', async () => {
    await desenhar('/entrega/novo');
    await preencherEEnviar();
    expect(mockEnviar).toHaveBeenCalledWith(
      EU,
      { moradaId: MORADA, destinatario: 'Maria João', telefone: '', instrucoes: '', urgente: false },
      true,
    );
    expect(r.getPathname()).toBe('/entrega/n1');
    expect(screen.getByTestId('pin-envio').props.children).toBe('4821');
    expect(screen.getByLabelText('PIN 4 8 2 1')).toBeTruthy();
    expect(screen.getByText('Pedido enviado. Dá o PIN só a quem vai receber a encomenda.')).toBeTruthy();
  });

  test('sem rede: fica na fila e volta à lista com o aviso', async () => {
    mockOnline = false;
    mockEnviar.mockResolvedValueOnce({ tipo: 'na_fila', operationId: 'op-1' });
    await desenhar('/entrega');
    await carregar('Novo envio');
    await preencherEEnviar();
    expect(mockEnviar.mock.calls[0][2]).toBe(false);
    expect(r.getPathname()).toBe('/entrega');
    expect(screen.getByText(AVISO_NA_FILA)).toBeTruthy();
  });

  test('o servidor recusa: mostra o erro em palavras simples', async () => {
    mockEnviar.mockRejectedValueOnce(new Error('CITIZEN_ID_NOT_VERIFIED: verifica a tua identidade'));
    await desenhar('/entrega/novo');
    await preencherEEnviar();
    expect(screen.getByText(/A tua identidade ainda não foi verificada/)).toBeTruthy();
  });
});

describe('Enviar: detalhe', () => {
  async function abrirDetalhe(id = 'e1') {
    await desenhar('/entrega');
    await carregar(new RegExp(`^Envio para ${id === 'e1' ? 'Maria João' : 'Bento'}`));
  }

  test('o PIN não aparece sozinho: "Mostrar o PIN" pede-o ao servidor', async () => {
    await abrirDetalhe();
    expect(screen.getByText('Por segurança, o PIN não fica guardado neste telemóvel.')).toBeTruthy();
    expect(screen.queryByTestId('pin-envio')).toBeNull();
    await carregar('Mostrar o PIN');
    expect(mockLerPin).toHaveBeenCalledWith('e1');
    expect(screen.getByTestId('pin-envio').props.children).toBe('4821');
  });

  test('gerar um PIN novo pede confirmação', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await abrirDetalhe();
    await carregar('Gerar um PIN novo');
    expect(alerta.mock.calls.at(-1)![0]).toBe('Gerar um PIN novo?');
    expect(mockGerarPin).not.toHaveBeenCalled();
    await escolherNoAlerta(alerta, 'Gerar PIN novo');
    expect(mockGerarPin).toHaveBeenCalledWith('e1');
    expect(screen.getByTestId('pin-envio').props.children).toBe('1357');
    alerta.mockRestore();
  });

  test('PIN bloqueado (5 tentativas erradas): avisa para gerar um novo', async () => {
    mockLerPin.mockResolvedValueOnce({ ...PIN, bloqueado: true });
    await abrirDetalhe();
    await carregar('Mostrar o PIN');
    expect(screen.getByText(/errou o PIN 5 vezes/)).toBeTruthy();
  });

  test('cancelar pede confirmação e volta à lista com o envio cancelado', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await abrirDetalhe();
    await carregar('Cancelar o envio');
    await escolherNoAlerta(alerta, 'Cancelar o envio');
    expect(mockCancelar).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(r.getPathname()).toBe('/entrega');
    expect(screen.getByText('Envio cancelado.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Envio para Maria João. Cancelada' })).toBeTruthy();
    alerta.mockRestore();
  });

  test('saiu para entrega: já não se cancela; sem rede não há PIN', async () => {
    mockOnline = false;
    await abrirDetalhe('e2');
    expect(screen.queryByRole('button', { name: 'Cancelar o envio' })).toBeNull();
    expect(screen.getByText('Sem rede. Ver ou gerar o PIN precisa de rede.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mostrar o PIN' })).toBeNull();
  });
});
