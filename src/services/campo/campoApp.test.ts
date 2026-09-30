import { describe, expect, jest, test } from '@jest/globals';

const mockUpload = jest.fn(async (..._a: unknown[]) => ({ error: null }));
const mockGetPublicUrl = jest.fn((caminho: string) => ({ data: { publicUrl: `https://p.supabase.co/storage/v1/object/public/field-photos/${caminho}` } }));
jest.mock('@/api/supabase', () => ({
  supabase: { storage: { from: jest.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })) } },
}));
jest.mock('@/api/edge/chamarFuncao', () => ({ chamarFuncao: jest.fn() }));
jest.mock('@/services/cofre/cofreApp', () => ({ cofreApp: { getItemAsync: jest.fn(), setItemAsync: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));

import { caminhoFotoCampo, enviarFotoCampo } from '@/services/campo/campoApp';

const UID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('Campo: fotos na pasta da pessoa (field-photos privado)', () => {
  test('o caminho é "<id>/<ficheiro>", sem o antigo "users/"', () => {
    expect(caminhoFotoCampo(`${UID}/abc.jpg`)).toBe(`${UID}/abc.jpg`);
    expect(caminhoFotoCampo(`users/${UID}/abc.jpg`)).toBe(`${UID}/abc.jpg`);
    expect(() => caminhoFotoCampo('abc.jpg')).toThrow();
    expect(() => caminhoFotoCampo(`${UID}/../x.jpg`)).toThrow();
  });

  test('envia para a pasta da pessoa', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, blob: async () => 'blob' }));
    const url = await enviarFotoCampo('file://foto.jpg', `${UID}/abc.jpg`);
    expect(mockUpload).toHaveBeenCalledWith(`${UID}/abc.jpg`, 'blob', { contentType: 'image/jpeg', upsert: false });
    expect(url).toContain(`/field-photos/${UID}/abc.jpg`);
  });
});
