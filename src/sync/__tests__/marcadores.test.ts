import { describe, expect, test } from '@jest/globals';

import { idsDosMarcadores, nomeNoStorage, trocarMarcadores, urlPublico } from '../marcadores';

describe('marcadores offline', () => {
  const payload = {
    photo_facade_url: 'offline:a',
    photo_qr_url: 'https://ja.existe/qr.jpg',
    outro_campo: 'offline:ignorado',
    proof: { photo_url: 'offline:b', signature_url: 'offline:a', nota: 'offline:tambem-ignorado' },
  };

  test('só lê os quatro campos do contrato, sem repetidos', () => {
    expect(idsDosMarcadores(payload)).toEqual(['a', 'b']);
    expect(idsDosMarcadores(null)).toEqual([]);
    expect(idsDosMarcadores({ proof: 'x' })).toEqual([]);
  });

  test('troca os marcadores conhecidos e não mexe no original', () => {
    const copia = JSON.parse(JSON.stringify(payload));
    const novo = trocarMarcadores(payload, new Map([['a', 'URL-A']]));
    expect(novo).toEqual({
      ...payload,
      photo_facade_url: 'URL-A',
      proof: { ...payload.proof, signature_url: 'URL-A' },
    });
    expect(payload).toEqual(copia);
  });

  test('nome e URL públicos', () => {
    expect(nomeNoStorage({ id: 'x1', content_type: 'image/jpeg' })).toBe('offline-x1.jpg');
    expect(nomeNoStorage({ id: 'x1', content_type: 'image/png' })).toBe('offline-x1.png');
    expect(nomeNoStorage({ id: 'x1', content_type: 'IMAGE/PNG' })).toBe('offline-x1.png');
    expect(nomeNoStorage({ id: 'x1', content_type: 'image/webp' })).toBe('offline-x1.jpg');
    expect(urlPublico('https://p.supabase.co', 'fotos', 'offline-x1.jpg')).toBe(
      'https://p.supabase.co/storage/v1/object/public/fotos/offline-x1.jpg',
    );
  });
});

describe('nomeNoStorage: provas de entrega na pasta de quem envia', () => {
  test('delivery-proofs → "<userId>/offline-<id>"; os outros buckets ficam na raiz', () => {
    expect(nomeNoStorage({ id: 'x1', content_type: 'image/png', bucket: 'delivery-proofs' }, 'u-1')).toBe('u-1/offline-x1.png');
    expect(nomeNoStorage({ id: 'x1', content_type: 'image/jpeg', bucket: 'field-photos' }, 'u-1')).toBe('u-1/offline-x1.jpg');
    expect(() => nomeNoStorage({ id: 'x1', content_type: 'image/jpeg', bucket: 'field-photos' })).toThrow();
    expect(() => nomeNoStorage({ id: 'x1', content_type: 'image/png', bucket: 'delivery-proofs' })).toThrow();
  });
});
