import { describe, expect, jest, test } from '@jest/globals';
import {
  contarCampoOffline,
  sincronizarCampoOffline,
  enfileirarCampoOffline,
  lerZonaCampoOffline,
  prepararZonaCampoOffline,
} from '@/services/campo/campoOffline';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'offline-test-id' }));

const mockFiles = new Map<string, { content: string }>();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: any[]) { this.uri = parts.map((p: any) => typeof p === 'string' ? p : p?.uri || '').filter(Boolean).join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    create() { mockFiles.set(this.uri, { content: '' }); }
    delete() { mockFiles.delete(this.uri); }
    async text() { return mockFiles.get(this.uri)?.content || ''; }
    async write(v: string) { if (!mockFiles.has(this.uri)) this.create(); mockFiles.get(this.uri)!.content = v; }
    async copy(dest: File) { mockFiles.set(dest.uri, { content: mockFiles.get(this.uri)?.content || 'photo' }); }
  }
  class Directory {
    uri: string;
    constructor(...parts: any[]) { this.uri = parts.map((p: any) => typeof p === 'string' ? p : p?.uri || '').filter(Boolean).join('/'); }
    get exists() { return true; }
    create() {}
  }
  return { File, Directory, Paths: { document: 'document' } };
});

jest.mock('@/api/edge/chamarFuncao', () => ({
  chamarFuncao: jest.fn(async () => ({
    centro: { latitude: -8.84, longitude: 13.23 },
    raio_metros: 800,
    moradas: [{ id: 'm1', latitude: -8.84, longitude: 13.23, street_name: 'Rua Teste', house_number: 10 }],
    preparado_em: '2026-01-01T00:00:00Z',
  })),
}));

jest.mock('@/services/campo/campoApp', () => ({
  prepararDispositivo: jest.fn(async () => 'device-test'),
}));

const mockUpload = jest.fn(async (..._a: unknown[]) => ({ error: null }));
jest.mock('@/api/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok', user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } } } })) },
    storage: { from: jest.fn(() => ({ upload: mockUpload, getPublicUrl: (c: string) => ({ data: { publicUrl: 'https://p/storage/v1/object/public/field-photos/' + c } }) })) },
  },
}));
jest.mock('@/config/env', () => ({ obterConfigSupabase: () => ({ url: 'https://p', chaveAnon: 'anon' }) }));

describe('Campo offline — persistência local', () => {
  test('prepara e lê a zona offline', async () => {
    const zona = await prepararZonaCampoOffline(-8.84, 13.23);
    expect(zona.raio_metros).toBe(800);
    expect((await lerZonaCampoOffline())?.moradas[0].street_name).toBe('Rua Teste');
  });

  test('fila uma recolha e mantém a operação após leitura', async () => {
    const photo = new (require('expo-file-system').File)('photo://facade');
    photo.create();
    const id = await enfileirarCampoOffline({ street_name: 'Rua Teste' }, photo.uri);
    expect(id).toBe('offline-test-id');
    expect(await contarCampoOffline()).toBe(1);
  });
});

describe('Campo offline — sincronização', () => {
  test('a foto vai para a pasta da pessoa em field-photos (não para "users/")', async () => {
    const pedidos: any[] = [];
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
      if (String(url).endsWith('/functions/v1/sync')) {
        pedidos.push(JSON.parse(init.body));
        return { ok: true, json: async () => ({ results: [{ status: 'SYNCED' }] }) };
      }
      return { blob: async () => 'blob' };
    });
    const r = await sincronizarCampoOffline();
    expect(r.synced).toBe(1);
    expect(mockUpload).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-000000000001/offline-test-id.jpg', 'blob', { contentType: 'image/jpeg', upsert: false });
    expect(pedidos[0].operations[0].payload.photo_facade_url).toBe('https://p/storage/v1/object/public/field-photos/aaaaaaaa-0000-4000-8000-000000000001/offline-test-id.jpg');
  });
});
