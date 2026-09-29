import { describe, expect, jest, test } from '@jest/globals';
import {
  contarCampoOffline,
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

jest.mock('@/api/supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, storage: { from: jest.fn() } } }));

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
