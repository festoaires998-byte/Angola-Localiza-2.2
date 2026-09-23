/**
 * @jest-environment node
 */
import { describe, expect, test } from '@jest/globals';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { criarHashFoto, sha256Hex } from '../hashFoto';

const hashFoto = criarHashFoto(async (caminho) => new Uint8Array(readFileSync(caminho)));

describe('hashFoto', () => {
  test('dá o SHA-256 certo para um ficheiro conhecido', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'hashfoto-'));
    const abc = join(pasta, 'abc.jpg');
    writeFileSync(abc, 'abc');
    // Valor de referência do SHA-256 ("abc"), FIPS 180-2.
    expect(await hashFoto(abc)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    const vazio = join(pasta, 'vazio.jpg');
    writeFileSync(vazio, '');
    expect(await hashFoto(vazio)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('bate com o SHA-256 do Node numa "foto" de 3 MB, e muda se mudar um byte', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'hashfoto-'));
    const bytes = Buffer.alloc(3 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const foto = join(pasta, 'foto.jpg');
    writeFileSync(foto, bytes);
    const h = await hashFoto(foto);
    expect(h).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);

    bytes[1000] ^= 1;
    writeFileSync(foto, bytes);
    expect(await hashFoto(foto)).not.toBe(h);
  });

  test('sha256Hex de bytes', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
