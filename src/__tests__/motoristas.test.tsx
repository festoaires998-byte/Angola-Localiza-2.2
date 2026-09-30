import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { CandidaturaPendente, DriverStatus } from '@/services/motorista/driverKyc';

const candidatura = (userId: string, extra: Partial<CandidaturaPendente> = {}): CandidaturaPendente => ({
  user_id: userId, country_code: 'AO', status: 'PENDING_REVIEW', vehicle_type: 'mota', vehicle_plate: 'LD-12-34-AB',
  vehicle_capacity_kg: 40, license_number: 'C123', license_expiry: '2030-01-01', submitted_at: '2026-09-30T10:00:00Z',
  email: 'moto@exemplo.ao', full_name: 'João Motorista', ...extra,
});

let mockLista: CandidaturaPendente[] = [];
let mockEstado: DriverStatus = { application: null, profile: null };
const mockRever = jest.fn(async (..._a: unknown[]) => ({ ok: true, status: 'APPROVED' }));
const mockDocumentos = jest.fn(async (_u: string) => ({
  id_document_path: 'https://assinado/id', license_front_path: 'https://assinado/frente', license_back_path: 'https://assinado/verso',
  vehicle_document_path: 'https://assinado/livrete', selfie_path: 'https://assinado/selfie',
}));
const mockSetOnline = jest.fn(async (online: boolean) => ({ ok: true, online }));
jest.mock('@/services/motorista/driverKyc', () => {
  const real = jest.requireActual('@/services/motorista/driverKyc') as typeof import('@/services/motorista/driverKyc');
  return {
    ...real,
    driverKyc: {
      status: jest.fn(async () => mockEstado),
      submit: jest.fn(),
      setOnline: (o: boolean) => mockSetOnline(o),
      listarPendentes: jest.fn(async () => mockLista),
      documentos: (u: string) => mockDocumentos(u),
      rever: (...a: unknown[]) => mockRever(...a),
    },
  };
});

let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: 'u-1', countryCode: 'AO' } }) }));
jest.mock('@/api/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));
jest.mock('expo-image-picker', () => ({}));

type Ecra = { default: () => React.JSX.Element };
const Candidaturas = (require('@/app/(tabs)/admin/motoristas') as Ecra).default;
const Motorista = (require('@/app/(tabs)/definicoes/motorista') as Ecra).default;

const carregar = async (nome: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: nome }));
  });
};

beforeEach(() => {
  mockOnline = true;
  mockLista = [candidatura('aaaaaaaa-1111-4111-8111-111111111111')];
  mockEstado = { application: null, profile: null };
  [mockRever, mockDocumentos, mockSetOnline].forEach((f) => f.mockClear());
});

describe('Admin: candidaturas de motorista', () => {
  test('lista quem se candidatou, com o veículo e a capacidade', async () => {
    render(<Candidaturas />);
    await act(async () => {});
    expect(screen.getByText('João Motorista')).toBeTruthy();
    expect(screen.getByText('mota · LD-12-34-AB')).toBeTruthy();
    expect(screen.getByText('40 kg')).toBeTruthy();
  });

  test('só aprova depois de abrir os documentos (links temporários)', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    render(<Candidaturas />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Aprovar' }).props.accessibilityState.disabled).toBe(true);
    await carregar('Ver documentos');
    expect(mockDocumentos).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111');
    await carregar('Abrir: Selfie');
    expect(abrir).toHaveBeenCalledWith('https://assinado/selfie');
    mockLista = [];
    await carregar('Aprovar');
    expect(mockRever).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111', 'approve', undefined);
    expect(screen.getByText('Candidatura de João Motorista aprovada.')).toBeTruthy();
    expect(screen.getByText('Não há candidaturas por rever.')).toBeTruthy();
  });

  test('recusar exige um motivo', async () => {
    render(<Candidaturas />);
    await act(async () => {});
    await carregar('Recusar');
    expect(mockRever).not.toHaveBeenCalled();
    expect(screen.getByText('Escreve o motivo da recusa (pelo menos 5 letras).')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Motivo da recusa'), 'Carta ilegível');
    await carregar('Recusar');
    expect(mockRever).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111', 'reject', 'Carta ilegível');
  });

  test('sem rede: avisa e não tenta ler', async () => {
    mockOnline = false;
    render(<Candidaturas />);
    await act(async () => {});
    expect(screen.getByText('Sem rede. A revisão das candidaturas precisa de rede.')).toBeTruthy();
  });
});

describe('Definições → Motorista', () => {
  test('aprovado: pode ficar disponível e indisponível', async () => {
    mockEstado = {
      application: { id: 'a', user_id: 'u-1', country_code: 'AO', status: 'APPROVED', vehicle_type: 'mota', vehicle_plate: 'X', license_number: 'C', license_expiry: null, rejection_reason: null, submitted_at: null },
      profile: { country_code: 'AO', status: 'APPROVED', online: false, vehicle_type: 'mota', vehicle_plate: 'X', latitude: null, longitude: null },
    };
    render(<Motorista />);
    await act(async () => {});
    expect(screen.getByText('País: AO. Estás indisponível: não recebes pedidos novos.')).toBeTruthy();
    await carregar('Ficar disponível');
    expect(mockSetOnline).toHaveBeenCalledWith(true);
    expect(screen.getByText('Estás disponível: os pedidos compatíveis aparecem em Entregas.')).toBeTruthy();
  });

  test('recusada: mostra o motivo e deixa corrigir e enviar de novo', async () => {
    mockEstado = {
      application: { id: 'a', user_id: 'u-1', country_code: 'AO', status: 'REJECTED', vehicle_type: 'mota', vehicle_plate: 'X', license_number: 'C', license_expiry: null, rejection_reason: 'Selfie escura', submitted_at: null },
      profile: null,
    };
    render(<Motorista />);
    await act(async () => {});
    expect(screen.getByText('Candidatura recusada: Selfie escura. Podes corrigir e enviar de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar candidatura a Motorista' })).toBeTruthy();
    expect(screen.getByLabelText('Capacidade de carga (kg)')).toBeTruthy();
  });
});
