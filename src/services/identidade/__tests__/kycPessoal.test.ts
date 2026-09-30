import { describe, expect, jest, test } from '@jest/globals';

const mockUpload = jest.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
jest.mock('@/api/supabase', () => ({ supabase: { storage: { from: jest.fn(() => ({ upload: mockUpload })) } } }));
const mockChamar = jest.fn(async (..._a: unknown[]): Promise<any> => ({}));
jest.mock('@/api/edge/chamarFuncao', () => ({ chamarFuncao: (...a: unknown[]) => mockChamar(...a) }));

import { enviarFicheiroKyc, kycPessoal } from '../kycPessoal';

describe('kycPessoal: pedidos ao servidor', () => {
  test('envia os bytes para kyc-artifacts/<id>/<nome> com o tipo certo', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    const caminho = await enviarFicheiroKyc('u-1', 'file://v.mp4', 'video-1.mp4', 'video/mp4');
    expect(caminho).toBe('u-1/video-1.mp4');
    expect(mockUpload).toHaveBeenCalledWith('u-1/video-1.mp4', expect.any(ArrayBuffer), { contentType: 'video/mp4', upsert: false });
  });

  test('ficheiro vazio ou recusado pelo Storage dá erro', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(enviarFicheiroKyc('u-1', 'file://v.mp4', 'v.mp4', 'video/mp4')).rejects.toThrow('vazio');
    (global as any).fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    mockUpload.mockResolvedValueOnce({ error: { message: 'mime type not supported' } });
    await expect(enviarFicheiroKyc('u-1', 'file://v.mp4', 'v.mp4', 'video/mp4')).rejects.toThrow('mime type not supported');
  });

  test('ações da identity-kyc', async () => {
    mockChamar.mockResolvedValueOnce({ challenge_sequence: ['sorri'] });
    expect(await kycPessoal.desafio()).toEqual(['sorri']);
    await kycPessoal.decidir('v1', 'reject', 'escuro');
    expect(mockChamar).toHaveBeenLastCalledWith('identity-kyc', 'review_decision', { body: { verification_id: 'v1', decision: 'reject', reason: 'escuro' } });
    mockChamar.mockResolvedValueOnce({ url: 'https://x' });
    expect(await kycPessoal.artefacto('v1', 'back')).toBe('https://x');
    expect(mockChamar).toHaveBeenLastCalledWith('identity-kyc', 'view_artifact', { body: { verification_id: 'v1', artifact: 'back' } });
  });
});
