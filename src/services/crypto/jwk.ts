import { p256 } from '@noble/curves/nist.js';

import { deBase64Url, paraBase64Url } from './base64';

/** Chave pública P-256 em JWK, como o Web Crypto do site/servidor a importa. */
export type JwkPublicaP256 = {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
};

const BYTES_COORDENADA = 32;

/**
 * Chave pública do @noble (33 ou 65 bytes) → JWK com x e y em base64url de 32 bytes.
 * Só tem os campos públicos: nunca "d".
 */
export function chavePublicaParaJwk(chavePublica: Uint8Array): JwkPublicaP256 {
  // fromBytes valida que o ponto está na curva; toBytes(false) = 0x04 || x || y.
  const bytes = p256.Point.fromBytes(chavePublica).toBytes(false);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: paraBase64Url(bytes.subarray(1, 1 + BYTES_COORDENADA)),
    y: paraBase64Url(bytes.subarray(1 + BYTES_COORDENADA)),
  };
}

/** JWK → chave pública do @noble (65 bytes, não comprimida). Lança erro se não for válida. */
export function jwkParaChavePublica(jwk: unknown): Uint8Array {
  const j = jwk as Partial<Record<string, unknown>> | null;
  if (!j || j.kty !== 'EC' || j.crv !== 'P-256') {
    throw new Error('A JWK não é uma chave EC P-256.');
  }
  if (typeof j.x !== 'string' || typeof j.y !== 'string') {
    throw new Error('A JWK não tem x e y.');
  }
  const x = deBase64Url(j.x);
  const y = deBase64Url(j.y);
  if (x.length !== BYTES_COORDENADA || y.length !== BYTES_COORDENADA) {
    throw new Error('x e y da JWK têm de ter 32 bytes.');
  }
  const bytes = new Uint8Array(1 + 2 * BYTES_COORDENADA);
  bytes[0] = 0x04;
  bytes.set(x, 1);
  bytes.set(y, 1 + BYTES_COORDENADA);
  p256.Point.fromBytes(bytes); // lança erro se o ponto não estiver na curva
  return bytes;
}

/** Mesma chave pública? (compara só x e y). */
export function mesmaChave(a: unknown, b: unknown): boolean {
  const ja = a as Partial<JwkPublicaP256> | null;
  const jb = b as Partial<JwkPublicaP256> | null;
  return !!ja && !!jb && ja.kty === jb.kty && ja.crv === jb.crv && ja.x === jb.x && ja.y === jb.y;
}
