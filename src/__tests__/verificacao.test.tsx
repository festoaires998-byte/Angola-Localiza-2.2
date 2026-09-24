import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DESAFIOS } from '@/domain/identidade/verificacaoSimples';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));

let mockN = 0;
const mockTirar = jest.fn(async () => ({ uri: `file:///cache/camara-${++mockN}.jpg` }));
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

const mockUma = jest.fn(async (uri: string, _linhas: [string, string], prefixo?: string) => ({
  uri: `file:///docs/fotos/${prefixo}.jpg`,
  sha256: `sha-${prefixo}`,
  tamanhoBytes: 100_000,
  origem: uri,
}));
const mockDuas = jest.fn(async (_a: string, _b: string, _linhas: [string, string]) => ({
  uri: 'file:///docs/fotos/selfies.jpg',
  sha256: 'sha-selfies',
  tamanhoBytes: 150_000,
}));
jest.mock('@/services/imagem/fotoComMarca', () => ({
  fotoComMarcaDeAgua: (uri: string, linhas: [string, string], prefixo?: string) => mockUma(uri, linhas, prefixo),
  fotosLadoALadoComMarca: (a: string, b: string, linhas: [string, string]) => mockDuas(a, b, linhas),
}));

let mockEstado = 'por_fazer';
const mockGuardar = jest.fn(async (_u: string, _f: unknown) => {
  mockEstado = 'pendente';
});
const mockEnviar = jest.fn(async (_u: string) => {
  mockEstado = 'verificado';
  return { resultado: 'verificado' };
});
jest.mock('@/services/identidade/verificacaoApp', () => ({
  servicoVerificacao: {
    estado: async () => mockEstado,
    guardarPedido: (u: string, f: unknown) => mockGuardar(u, f),
    enviarPendente: (u: string) => mockEnviar(u),
  },
}));

let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: 'user-1' } }) }));

const Verificacao = (require('@/app/(tabs)/definicoes/verificacao') as { default: () => React.JSX.Element }).default;

async function desenhar() {
  render(<Verificacao />);
  await act(async () => undefined);
}

/** Abre a câmara do n-ésimo passo que ainda não tem foto e tira a foto. */
async function fotografar() {
  await act(async () => {
    fireEvent.press(screen.getAllByRole('button', { name: 'Abrir a câmara' }).find((b) => !b.props.accessibilityState.disabled)!);
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Tirar foto' }));
  });
}

beforeEach(() => {
  mockEstado = 'por_fazer';
  mockOnline = true;
  mockN = 0;
  [mockBack, mockTirar, mockUma, mockDuas, mockGuardar, mockEnviar].forEach((f) => f.mockClear());
});

describe('Verificação simples', () => {
  test('já verificado: diz que pode registar moradas', async () => {
    mockEstado = 'verificado';
    await desenhar();
    expect(screen.getByText(/já está verificada/)).toBeTruthy();
  });

  test('passos por ordem: o verso e as selfies só abrem depois do passo anterior', async () => {
    await desenhar();
    const botoes = screen.getAllByRole('button', { name: 'Abrir a câmara' });
    expect(botoes.map((b) => b.props.accessibilityState.disabled)).toEqual([false, true, true, true]);
    expect(screen.getByRole('button', { name: 'Enviar a verificação' }).props.accessibilityState.disabled).toBe(true);
  });

  test('BI frente, verso, selfie e selfie com o gesto → junta as selfies, guarda e envia', async () => {
    await desenhar();
    const gesto = DESAFIOS.find((d) => screen.queryByText(`Agora: ${d.toLowerCase()}.`));
    expect(gesto).toBeDefined();

    await fotografar(); // frente
    expect(mockUma).toHaveBeenLastCalledWith('file:///cache/camara-1.jpg', ['Angola Localiza — verificação', expect.any(String)], 'bi-frente');
    await fotografar(); // verso
    await fotografar(); // selfie
    expect(screen.getByText('Primeira selfie tirada ✓')).toBeTruthy();
    await fotografar(); // selfie com o gesto
    expect(mockDuas).toHaveBeenCalledWith('file:///cache/camara-3.jpg', 'file:///cache/camara-4.jpg', [
      'Angola Localiza — verificação',
      expect.stringContaining(`Gesto: ${gesto}`),
    ]);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Enviar a verificação' }));
    });
    expect(mockGuardar).toHaveBeenCalledWith('user-1', {
      frente: { uri: 'file:///docs/fotos/bi-frente.jpg', sha256: 'sha-bi-frente' },
      verso: { uri: 'file:///docs/fotos/bi-verso.jpg', sha256: 'sha-bi-verso' },
      selfie: { uri: 'file:///docs/fotos/selfies.jpg', sha256: 'sha-selfies' },
    });
    expect(mockEnviar).toHaveBeenCalledWith('user-1');
    expect(screen.getByText(/já está verificada/)).toBeTruthy();
  });

  test('sem rede: guarda para enviar depois (não tenta enviar)', async () => {
    mockOnline = false;
    await desenhar();
    for (let i = 0; i < 4; i++) await fotografar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar para enviar' }));
    });
    expect(mockGuardar).toHaveBeenCalled();
    expect(mockEnviar).not.toHaveBeenCalled();
    expect(screen.getByText(/guardada neste telemóvel e é enviada sozinha/)).toBeTruthy();
    expect(screen.getByText(/Sem rede: ficou guardado neste telemóvel/)).toBeTruthy();
  });

  test('pendente: com rede, "Enviar agora"', async () => {
    mockEstado = 'pendente';
    await desenhar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Enviar agora' }));
    });
    expect(mockEnviar).toHaveBeenCalledWith('user-1');
    expect(screen.getByText(/já está verificada/)).toBeTruthy();
  });

  test('pendente e o servidor recusa: mostra o erro', async () => {
    mockEstado = 'pendente';
    mockEnviar.mockImplementationOnce(async () => ({ resultado: 'falhou', erro: 'Sem ligação ao servidor.' }));
    await desenhar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Enviar agora' }));
    });
    expect(screen.getByText('Ainda não foi possível enviar: Sem ligação ao servidor.')).toBeTruthy();
  });
});
