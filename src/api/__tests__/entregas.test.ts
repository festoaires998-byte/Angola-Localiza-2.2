import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockChamar = jest.fn(async (_nome: string, _acao: string, _o?: { body?: unknown }): Promise<unknown> => ({}));
jest.mock('../edge/chamarFuncao', () => ({
  chamarFuncao: (nome: string, acao: string, o?: { body?: unknown }) => mockChamar(nome, acao, o),
}));

const mockConsulta = { select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn() };
let mockResposta: { data: unknown; error: { message: string } | null } = { data: [], error: null };
jest.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => {
      mockConsulta.select.mockImplementation(() => mockConsulta);
      mockConsulta.eq.mockImplementation(() => mockConsulta);
      mockConsulta.order.mockImplementation(() => mockConsulta);
      mockConsulta.limit.mockImplementation(async () => mockResposta);
      return { ...mockConsulta, tabela: t };
    },
  },
}));

const { cancelarEnvio, criarEnvio, gerarPinNovo, lerPinEnvio, listarEnvios } = require('../entregas') as typeof import('../entregas');

beforeEach(() => {
  mockChamar.mockClear();
  mockResposta = { data: [], error: null };
});

describe('api/entregas', () => {
  test('criarEnvio: deliveries?action=create; separa o PIN da entrega', async () => {
    mockChamar.mockResolvedValueOnce({
      id: 'e1',
      tracking_code: 'ABC',
      status: 'CREATED',
      recipient_name: 'Maria',
      confirmation_pin: '4821',
      confirmation_pin_expires_at: '2026-09-27T10:00:00Z',
    });
    const pedido = { address_id: 'm1', recipient_name: 'Maria', recipient_phone: null, instructions: null, is_urgent: false };
    const r = await criarEnvio(pedido);
    expect(mockChamar).toHaveBeenCalledWith('deliveries', 'create', { body: pedido });
    expect(r.pin).toEqual({ pin: '4821', expiraEm: '2026-09-27T10:00:00Z', bloqueado: false });
    expect(r.envio).toMatchObject({ id: 'e1', codigo: 'ABC', destinatario: 'Maria' });
    expect(JSON.stringify(r.envio)).not.toContain('4821');
  });

  test('criarEnvio sem PIN na resposta: pin null', async () => {
    mockChamar.mockResolvedValueOnce({ id: 'e1', status: 'CREATED' });
    expect((await criarEnvio({ address_id: 'm', recipient_name: 'A', recipient_phone: null, instructions: null, is_urgent: false })).pin).toBeNull();
  });

  test('listarEnvios: só as do utilizador, colunas públicas (sem o PIN)', async () => {
    mockResposta = { data: [{ id: 'e1', status: 'ASSIGNED', recipient_name: 'Maria' }], error: null };
    const lista = await listarEnvios('u1');
    expect(lista.map((e) => e.id)).toEqual(['e1']);
    expect(mockConsulta.eq).toHaveBeenCalledWith('created_by', 'u1');
    const colunas = mockConsulta.select.mock.calls[0][0] as string;
    expect(colunas).not.toMatch(/confirmation_pin\b/);
    mockResposta = { data: null, error: { message: 'permission denied' } };
    await expect(listarEnvios('u1')).rejects.toThrow('Não foi possível ler os envios (permission denied).');
  });

  test('PIN, PIN novo e cancelar vão para a deliveries', async () => {
    mockChamar.mockResolvedValue({ pin: '1234', expires_at: null, bloqueado: false });
    expect((await lerPinEnvio('e1')).pin).toBe('1234');
    expect((await gerarPinNovo('e1')).pin).toBe('1234');
    await cancelarEnvio('e1');
    expect(mockChamar.mock.calls.map((c) => [c[1], c[2]?.body])).toEqual([
      ['get_pin', { delivery_id: 'e1' }],
      ['regenerate_pin', { delivery_id: 'e1' }],
      ['update_status', { delivery_id: 'e1', new_status: 'CANCELLED' }],
    ]);
  });
});
