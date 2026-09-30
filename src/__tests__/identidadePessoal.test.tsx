import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import {
  cargoPodeReverKycPessoal,
  duracaoVideoValida,
  numeroBiValido,
  situacaoKyc,
  tipoVideo,
  type EstadoKycPessoal,
  type PedidoKycPessoal,
} from '@/services/identidade/kycPessoal';

const UID = 'aaaaaaaa-0000-4000-8000-000000000001';
const estadoBase: EstadoKycPessoal = { status: 'PENDING_ID', resend_count: 0, cooldown_until: null, protocol: null, submitted_at: null, last_rejection_reason: null };

let mockEstado: EstadoKycPessoal = estadoBase;
let mockPendentes: PedidoKycPessoal[] = [];
const mockEnviar = jest.fn(async (_p: unknown) => ({ ok: true, protocol: 'ABCD1234' }));
const mockDecidir = jest.fn(async (..._a: unknown[]) => ({ ok: true }));
const mockArtefacto = jest.fn(async (..._a: unknown[]): Promise<string | null> => 'https://assinado/ficheiro');
const mockEnviarFicheiro = jest.fn(async (_u: string, _uri: string, nome: string) => `${UID}/${nome}`);
jest.mock('@/services/identidade/kycPessoal', () => {
  const real = jest.requireActual('@/services/identidade/kycPessoal') as typeof import('@/services/identidade/kycPessoal');
  return {
    ...real,
    enviarFicheiroKyc: (u: string, uri: string, nome: string) => mockEnviarFicheiro(u, uri, nome),
    kycPessoal: {
      estado: jest.fn(async () => mockEstado),
      desafio: jest.fn(async () => ['sorri', 'pisca os olhos', 'vira a cabeca para a esquerda']),
      enviar: (p: unknown) => mockEnviar(p),
      pendentes: jest.fn(async () => mockPendentes),
      artefacto: (...a: unknown[]) => mockArtefacto(...a),
      decidir: (...a: unknown[]) => mockDecidir(...a),
    },
  };
});

let mockDuracaoMs = 10_000;
jest.mock('expo-image-picker', () => ({
  CameraType: { front: 'front', back: 'back' },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async (o: { mediaTypes: string[] }) => ({
    canceled: false,
    assets: [o.mediaTypes[0] === 'videos' ? { uri: 'file://video.mp4', duration: mockDuracaoMs } : { uri: 'file://foto.jpg' }],
  })),
}));
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => true }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: UID } }) }));
jest.mock('@/api/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

type Ecra = { default: () => React.JSX.Element };
const Identidade = (require('@/app/(tabs)/definicoes/identidade') as Ecra).default;
const Revisao = (require('@/app/(tabs)/admin/identidade') as Ecra).default;

const carregar = async (nome: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: nome }));
  });
};

beforeEach(() => {
  mockEstado = estadoBase;
  mockDuracaoMs = 10_000;
  mockPendentes = [{ id: 'v1', user_id: UID, method: 'LIVENESS_VIDEO', id_last4: 'HO45', created_at: '2026-09-30T10:00:00Z', email: 'tec@exemplo.ao', protocol: 'V1V1V1V1' }];
  [mockEnviar, mockDecidir, mockArtefacto, mockEnviarFicheiro].forEach((f) => f.mockClear());
});

describe('regras', () => {
  test('situação a partir do estado do servidor', () => {
    const agora = new Date('2026-09-30T12:00:00Z');
    expect(situacaoKyc({ ...estadoBase, status: 'ID_VERIFIED' }, agora)).toEqual({ tipo: 'verificado' });
    expect(situacaoKyc({ ...estadoBase, protocol: 'P1', submitted_at: '2026-09-30T09:00:00Z' }, agora)).toEqual({ tipo: 'em_revisao', protocolo: 'P1', horas: 3 });
    expect(situacaoKyc({ ...estadoBase, cooldown_until: '2026-10-05T00:00:00Z' }, agora)).toEqual({ tipo: 'bloqueado', ate: '2026-10-05T00:00:00Z' });
    expect(situacaoKyc({ ...estadoBase, protocol: 'P1', resend_count: 1, last_rejection_reason: 'escuro' }, agora)).toEqual({ tipo: 'por_enviar', tentativa: 2, motivoAnterior: 'escuro' });
  });

  test('BI, duração do vídeo, formato do vídeo e quem revê', () => {
    expect(numeroBiValido('008807453ho45')).toBe(true);
    expect(numeroBiValido('12345')).toBe(false);
    expect(duracaoVideoValida(8)).toBe(true);
    expect(duracaoVideoValida(7.9)).toBe(false);
    expect(duracaoVideoValida(15.1)).toBe(false);
    expect(tipoVideo('file://a.MOV')).toEqual({ contentType: 'video/quicktime', extensao: 'mov' });
    expect(tipoVideo('file://a.mp4?x=1')).toEqual({ contentType: 'video/mp4', extensao: 'mp4' });
    expect(cargoPodeReverKycPessoal(['auditor'])).toBe(true);
    expect(cargoPodeReverKycPessoal(['supervisor'])).toBe(false);
  });
});

describe('Definições → Verificação de identidade', () => {
  test('envia as 2 fotos do BI e o vídeo para a pasta da pessoa e pede a revisão', async () => {
    render(<Identidade />);
    await act(async () => {});
    await carregar('Enviar para revisão');
    expect(screen.getByText(/^Falta: o consentimento, o número do BI/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Aceito que as fotos do BI e o vídeo sejam vistos por um revisor para confirmar a minha identidade.'));
    fireEvent.changeText(screen.getByLabelText('Número do BI'), '008807453ho45');
    await carregar('Fotografar a frente do BI');
    await carregar('Fotografar o verso do BI');
    await carregar('Preparar o vídeo');
    expect(screen.getByText('1. sorri')).toBeTruthy();
    await carregar('Gravar o vídeo');
    await carregar('Enviar para revisão');

    expect(mockEnviarFicheiro.mock.calls.map((c) => c[2])).toEqual([
      expect.stringMatching(/^bi-frente-\d+\.jpg$/), expect.stringMatching(/^bi-verso-\d+\.jpg$/), expect.stringMatching(/^video-\d+\.mp4$/),
    ]);
    expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({
      id_number: '008807453HO45', video_duration_seconds: 10,
      challenge_sequence: ['sorri', 'pisca os olhos', 'vira a cabeca para a esquerda'],
      id_photo_url: expect.stringMatching(new RegExp(`^${UID}/bi-frente-`)),
    }));
    expect(screen.getByText('Enviado! Protocolo #ABCD1234 — aguarda a revisão (até 24 h).')).toBeTruthy();
  });

  test('vídeo curto demais: não é enviado', async () => {
    mockDuracaoMs = 5_000;
    render(<Identidade />);
    await act(async () => {});
    await carregar('Preparar o vídeo');
    await carregar('Gravar o vídeo');
    expect(screen.getByText('O vídeo durou 5.0 s. Tem de ter entre 8 e 15 segundos. Grava outra vez.')).toBeTruthy();
    expect(mockEnviarFicheiro).not.toHaveBeenCalled();
  });

  test('em revisão e verificada', async () => {
    mockEstado = { ...estadoBase, protocol: 'P1', submitted_at: new Date().toISOString() };
    const { unmount } = render(<Identidade />);
    await act(async () => {});
    expect(screen.getByText(/Em revisão — enviado há 0 h/)).toBeTruthy();
    unmount();
    mockEstado = { ...estadoBase, status: 'ID_VERIFIED' };
    render(<Identidade />);
    await act(async () => {});
    expect(screen.getByText('✅ Identidade verificada.')).toBeTruthy();
  });
});

describe('Admin → Identidade do pessoal', () => {
  test('só aprova depois de confirmar todos os pontos; abre os ficheiros com links temporários', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    render(<Revisao />);
    await act(async () => {});
    expect(screen.getByText('tec@exemplo.ao')).toBeTruthy();
    await carregar('Ver vídeo');
    expect(mockArtefacto).toHaveBeenCalledWith('v1', 'video');
    expect(abrir).toHaveBeenCalledWith('https://assinado/ficheiro');
    expect(screen.getByRole('button', { name: 'Aprovar' }).props.accessibilityState.disabled).toBe(true);
    for (const t of ['É um BI angolano (não outro cartão)', 'Frente legível e o número coincide', 'Verso legível', 'O rosto do vídeo é igual à foto do BI', 'Os desafios do vídeo foram cumpridos']) {
      fireEvent.press(screen.getByLabelText(t));
    }
    await carregar('Aprovar');
    expect(mockDecidir).toHaveBeenCalledWith('v1', 'approve', undefined);
  });

  test('recusar exige motivo', async () => {
    render(<Revisao />);
    await act(async () => {});
    await carregar('Recusar');
    expect(mockDecidir).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Motivo da recusa'), 'Verso ilegível');
    await carregar('Recusar');
    expect(mockDecidir).toHaveBeenCalledWith('v1', 'reject', 'Verso ilegível');
  });
});
