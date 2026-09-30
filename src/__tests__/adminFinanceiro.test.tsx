import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Admin → Financeiro: as tarifas vêm da função pricing (country_pricing_zones, por país),
// as mesmas que o servidor usa para cobrar; antes lia a tabela antiga pricing_zones.
const mockFuncao = jest.fn(async (nome: string, acao: string, _body?: unknown): Promise<any> => {
  if (nome === 'pricing' && acao === 'list_zones') {
    return { zones: [{ country_code: 'AO', zone_code: 'A', name: 'Mesmo município', currency_code: 'AOA', base_fee: 1500, routing_fee: 500, proof_fee: 200, bulky_fee: 500, long_wait_fee: 300 }] };
  }
  return { ok: true };
});
const mockRestGet = jest.fn(async (_p: string): Promise<any> => []);
jest.mock('@/api/adminGestao', () => {
  const real = jest.requireActual('@/api/adminGestao') as Record<string, unknown>;
  return {
    ...real,
    chamarFuncao: (n: string, a: string, b?: unknown) => mockFuncao(n, a, b),
    restGet: (p: string) => mockRestGet(p),
    chamarAdmin: jest.fn(async () => ({})),
    chamarAdminGet: jest.fn(async () => ({})),
    chamarEndpoint: jest.fn(async () => ({})),
  };
});
jest.mock('@/api/revisaoKyc', () => ({ listarPedidosKyc: jest.fn(async () => []) }));
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => true }));
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ perfil: { cargos: ['super_admin'] } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const GestaoAdmin = (require('@/app/(tabs)/admin/index') as { default: () => React.JSX.Element }).default;

describe('Admin → Financeiro', () => {
  test('mostra as tarifas por país e grava com o país e os extras', async () => {
    render(<GestaoAdmin />);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByText('💰 Financeiro'));
    });
    expect(mockFuncao).toHaveBeenCalledWith('pricing', 'list_zones', undefined);
    expect(mockRestGet).not.toHaveBeenCalledWith(expect.stringContaining('pricing_zones'));
    expect(screen.getByText('AO · Zona A — Mesmo município')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Volumoso (Kz)'), '700');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar zona' }));
    });
    expect(mockFuncao).toHaveBeenCalledWith('pricing', 'admin_update_zone', {
      country_code: 'AO', zone_code: 'A', base_fee: 1500, routing_fee: 500, proof_fee: 200, bulky_fee: 700, long_wait_fee: 300,
    });
  });

  test('Operação: leva à revisão das candidaturas de motorista', async () => {
    render(<GestaoAdmin />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: '🚚 Rever candidaturas de motorista' })).toBeTruthy();
  });
});
