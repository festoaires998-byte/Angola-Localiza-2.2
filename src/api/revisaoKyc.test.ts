import { afterEach, describe, expect, jest, test } from '@jest/globals';

const mockChamar = jest.fn(async (_nome: string, _acao: string, _o?: { body?: unknown }): Promise<unknown> => ({ ok: true }));
jest.mock('./edge/chamarFuncao', () => ({
  chamarFuncao: (nome: string, acao: string, o?: { body?: unknown }) => mockChamar(nome, acao, o),
}));

import { decidirPedidoKyc, lerFotoKyc, listarPedidosKyc } from './revisaoKyc';

const fetchOriginal = global.fetch;
afterEach(() => {
  global.fetch = fetchOriginal;
  mockChamar.mockClear();
});

describe('api da revisão das verificações', () => {
  test('list_pending e review na citizen-verify, com o corpo que o servidor espera', async () => {
    mockChamar.mockResolvedValueOnce({ pending: [{ user_id: 'u1', front_url: 'https://x/f' }] });
    expect(await listarPedidosKyc()).toEqual([{ userId: 'u1', enviadoEm: null, frente: 'https://x/f', verso: null, selfie: null }]);
    expect(mockChamar).toHaveBeenLastCalledWith('citizen-verify', 'list_pending', expect.anything());

    await decidirPedidoKyc('u1', { aprovar: true });
    expect(mockChamar).toHaveBeenLastCalledWith('citizen-verify', 'review', expect.objectContaining({ body: { user_id: 'u1', decision: 'approve' } }));
    await decidirPedidoKyc('u1', { aprovar: false, motivo: '  BI ilegível ' });
    expect(mockChamar).toHaveBeenLastCalledWith(
      'citizen-verify',
      'review',
      expect.objectContaining({ body: { user_id: 'u1', decision: 'reject', reason: 'BI ilegível' } }),
    );
    mockChamar.mockResolvedValueOnce({});
    await expect(decidirPedidoKyc('u1', { aprovar: true })).rejects.toThrow('não confirmou');
  });

  test('foto: descarrega sem cache e devolve "data:" (nada vai para ficheiros)', async () => {
    const pedidos: unknown[] = [];
    global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
      pedidos.push([url, init]);
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    expect(await lerFotoKyc('https://x/f?token=t')).toBe('data:image/jpeg;base64,/9j/');
    expect(pedidos).toEqual([['https://x/f?token=t', { cache: 'no-store' }]]);
  });

  test('foto: link expirado, resposta que não é imagem e sem rede', async () => {
    global.fetch = jest.fn(async () => new Response('{"error":"InvalidJWT"}', { status: 400 })) as unknown as typeof fetch;
    await expect(lerFotoKyc('https://x/f')).rejects.toThrow('O link da foto expirou.');
    global.fetch = jest.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    await expect(lerFotoKyc('https://x/f')).rejects.toThrow('não é uma imagem');
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(lerFotoKyc('https://x/f')).rejects.toThrow('Sem ligação ao servidor.');
  });
});
