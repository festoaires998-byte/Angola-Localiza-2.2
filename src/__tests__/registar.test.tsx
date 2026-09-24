import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { limitesCelula } from '@/domain/enderecamento/codigoPostal';
import { codigosDasDuasCelulas } from '@/domain/enderecamento/registoMorada';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));

const mockTirar = jest.fn(async () => ({ uri: 'file:///cache/camara.jpg' }));
jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
    CameraView: React.forwardRef((props: object, ref) => {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTirar }));
      return <View {...props} />;
    }),
  };
});

const mockFotoComMarca = jest.fn(async (_uri: string, _linhas: [string, string]) => ({
  uri: 'file:///docs/fotos/fachada.jpg',
  sha256: 'ab'.repeat(32),
  tamanhoBytes: 150_000,
}));
jest.mock('@/services/imagem/fotoComMarca', () => ({
  fotoComMarcaDeAgua: (uri: string, linhas: [string, string]) => mockFotoComMarca(uri, linhas),
}));

let mockVerificacao = 'verificado';
let mockRuas: { ruas: { id: string; nome: string }[]; doServidor: boolean } = {
  ruas: [{ id: 'r1', nome: 'Rua da Missão' }],
  doServidor: true,
};
let mockDuplicado: unknown = null;
const mockEnviar = jest.fn(async (_u: string, _d: unknown) => ({ operationId: 'op-1', pedido: {} }));
jest.mock('@/services/moradas/registoApp', () => ({
  servicoRegisto: {
    verificacao: async () => mockVerificacao,
    ruasPerto: async () => mockRuas,
    duplicadoPerto: async () => mockDuplicado,
    guardarFoto: async () => 'offline:foto-1',
    enviar: (u: string, d: unknown) => mockEnviar(u, d),
  },
}));

let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: 'user-1' } }) }));
jest.mock('@/hooks/usePosicao', () => ({
  usePosicao: () => ({ estado: 'ok', posicao: { latitude: 0, longitude: 0, precisao: 4, hora: 1 }, tentarDeNovo: jest.fn() }),
}));
jest.mock('@/hooks/useInfoLocal', () => ({
  useInfoLocal: () => ({ local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'servidor', atualizadoEm: null } }),
}));
const mockMedirDeNovo = jest.fn();
let mockMedida: Record<string, unknown> = {};
jest.mock('@/hooks/useCapturaGps', () => ({ useCapturaGps: () => ({ ...mockMedida, medirDeNovo: mockMedirDeNovo }) }));

const Registar = (require('@/app/(tabs)/guardados/registar') as { default: () => React.JSX.Element }).default;

const c = limitesCelula(-12.7761, 15.7392);
const CENTRO = { latitude: (c.latMin + c.latMax) / 2, longitude: (c.lngMin + c.lngMax) / 2 };
const JUNTO = { latitude: c.latMax - 2 / 110_574, longitude: CENTRO.longitude };

function medida(p: { latitude: number; longitude: number }, precisao = 4, fraca = false) {
  return {
    captura: { ...p, precisao, leituras: 5, fraca },
    aMedir: fraca,
    leiturasBoas: 0,
    necessarias: 3,
    limite: 10,
    melhorAteAgora: null,
  };
}

const botaoEnviar = () => screen.getByRole('button', { name: 'Enviar para revisão' });

async function desenhar() {
  render(<Registar />);
  await act(async () => undefined);
}

async function preencherEFotografar() {
  fireEvent.press(screen.getByRole('radio', { name: 'Rua: Rua da Missão' }));
  fireEvent.changeText(screen.getByLabelText('Referência (para ajudar a encontrar)'), 'Portão azul');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Abrir a câmara' }));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Tirar foto' }));
  });
}

beforeEach(() => {
  mockOnline = true;
  mockVerificacao = 'verificado';
  mockRuas = { ruas: [{ id: 'r1', nome: 'Rua da Missão' }], doServidor: true };
  mockDuplicado = null;
  mockMedida = medida(CENTRO);
  [mockBack, mockTirar, mockFotoComMarca, mockEnviar, mockMedirDeNovo].forEach((f) => f.mockClear());
});

describe('Registar morada', () => {
  test('registo completo: rua, referência, foto com marca de água → fila', async () => {
    await desenhar();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
    await preencherEFotografar();
    // A marca de água leva o Plus Code medido e a data/hora.
    expect(mockFotoComMarca).toHaveBeenCalledWith('file:///cache/camara.jpg', [expect.stringMatching(/^Plus Code 5FVQ/), expect.any(String)]);
    expect(screen.getByLabelText('Foto da fachada')).toBeTruthy();
    expect(screen.queryByText('Falta:')).toBeNull();
    await act(async () => {
      fireEvent.press(botaoEnviar());
    });
    expect(mockEnviar).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ruaId: 'r1', referencia: 'Portão azul', foto: 'offline:foto-1', tipo: 'Casa', escolhaCelula: null }),
    );
    expect(screen.getByText(/Registo enviado para revisão/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Voltar às moradas' }));
    expect(mockBack).toHaveBeenCalled();
  });

  test('precisão pior que 10 m: avisa e não deixa enviar nem fotografar', async () => {
    mockMedida = medida(CENTRO, 15, true);
    await desenhar();
    expect(screen.getByText(/só se pode registar com menos de ±10 m/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir a câmara' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Precisão melhor que ±10 m/)).toBeTruthy();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
  });

  test('junto ao limite: pede para medir no centro da entrada ou escolher a célula (nunca "à sorte")', async () => {
    mockMedida = medida(JUNTO);
    await desenhar();
    expect(screen.getByText(/Estás a 2 m do limite entre duas células/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Medir de novo' }));
    expect(mockMedirDeNovo).toHaveBeenCalled();

    const codigos = codigosDasDuasCelulas(JUNTO.latitude, JUNTO.longitude, 'Huambo');
    expect(screen.getByText(codigos.esta)).toBeTruthy();
    expect(screen.getByText(codigos.vizinha)).toBeTruthy();

    await preencherEFotografar();
    expect(screen.getByText(/mede no centro da entrada ou escolhe a célula/)).toBeTruthy();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByRole('radio', { name: `Célula: A célula vizinha (a norte), ${codigos.vizinha}` }));
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(botaoEnviar());
    });
    expect(mockEnviar).toHaveBeenCalledWith('user-1', expect.objectContaining({ escolhaCelula: 'vizinha' }));
  });

  test('junto ao limite: a medição a melhorar (mexe uns cm) não apaga a célula escolhida', async () => {
    mockMedida = medida(JUNTO);
    const { rerender } = render(<Registar />);
    await act(async () => undefined);
    const codigos = codigosDasDuasCelulas(JUNTO.latitude, JUNTO.longitude, 'Huambo');
    fireEvent.press(screen.getByRole('radio', { name: `Célula: A célula vizinha (a norte), ${codigos.vizinha}` }));
    // Nova leitura: 20 cm ao lado, as mesmas duas células.
    mockMedida = medida({ latitude: JUNTO.latitude - 0.2 / 110_574, longitude: JUNTO.longitude }, 3);
    rerender(<Registar />);
    await act(async () => undefined);
    expect(
      screen.getByRole('radio', { name: `Célula: A célula vizinha (a norte), ${codigos.vizinha}` }).props.accessibilityState.selected,
    ).toBe(true);
  });

  test('cidadão sem a verificação simples: explica, abre a verificação na app e não deixa enviar', async () => {
    mockVerificacao = 'por_verificar';
    await desenhar();
    expect(screen.getByText(/tens de fazer primeiro a verificação simples/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Fazer a verificação simples' }));
    expect(mockPush).toHaveBeenCalledWith('/definicoes/verificacao');
    await preencherEFotografar();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
  });

  test('verificação guardada no telemóvel (ainda por enviar): avisa e não deixa enviar', async () => {
    mockVerificacao = 'pendente';
    await desenhar();
    expect(screen.getByText(/verificação simples está guardada neste telemóvel/)).toBeTruthy();
    await preencherEFotografar();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
  });

  test('verificação em revisão: explica que espera pela equipa e não deixa enviar', async () => {
    mockVerificacao = 'em_revisao';
    await desenhar();
    expect(screen.getByText(/está em revisão pela equipa/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Ver a verificação' }));
    expect(mockPush).toHaveBeenCalledWith('/definicoes/verificacao');
    await preencherEFotografar();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
  });

  test('verificação recusada: pede para a fazer de novo e não deixa enviar', async () => {
    mockVerificacao = 'rejeitado';
    await desenhar();
    expect(screen.getByText(/não foi aprovada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fazer a verificação de novo' })).toBeTruthy();
    await preencherEFotografar();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
  });

  test('sem rede: escreve a rua à mão e o registo fica guardado para enviar depois', async () => {
    mockOnline = false;
    mockVerificacao = 'desconhecido';
    mockRuas = { ruas: [], doServidor: false };
    await desenhar();
    expect(screen.getByText(/Sem rede não deu para confirmar a tua verificação/)).toBeTruthy();
    expect(screen.getByText(/Sem rede e sem ruas guardadas desta zona/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Nome da rua'), 'Rua Nova');
    fireEvent.changeText(screen.getByLabelText('Referência (para ajudar a encontrar)'), 'Casa amarela');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Abrir a câmara' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Tirar foto' }));
    });
    await act(async () => {
      fireEvent.press(botaoEnviar());
    });
    expect(mockEnviar).toHaveBeenCalledWith('user-1', expect.objectContaining({ ruaId: null, ruaNome: 'Rua Nova' }));
    expect(screen.getByText(/ficou guardado neste telemóvel/)).toBeTruthy();
  });

  test('morada a menos de 15 m: só envia depois de confirmar que é um local diferente', async () => {
    mockDuplicado = { distanciaM: 8.4, codigoPostal: 'AO-HUA-MNFQR6JW-90' };
    await desenhar();
    await waitFor(() => expect(screen.getByText(/Já existe uma morada a 8 m: AO-HUA-MNFQR6JW-90/)).toBeTruthy());
    await preencherEFotografar();
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'Morada perto: É um local diferente' }));
    expect(botaoEnviar().props.accessibilityState.disabled).toBe(false);
  });

  test('erro da foto (ex.: marca de água) aparece e não guarda a foto', async () => {
    mockFotoComMarca.mockRejectedValueOnce(new Error('Não foi possível preparar a marca de água.'));
    await desenhar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Abrir a câmara' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Tirar foto' }));
    });
    expect(screen.getByText('Não foi possível preparar a marca de água.')).toBeTruthy();
    expect(screen.queryByLabelText('Foto da fachada')).toBeNull();
  });
});
