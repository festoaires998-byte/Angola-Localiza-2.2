import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { File } from 'expo-file-system';

/** SHA-256 (hex, minúsculas) de uns bytes. */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** Cria hashFoto() com o leitor de ficheiros recebido (trocável nos testes). */
export function criarHashFoto(lerBytes: (uri: string) => Promise<Uint8Array>) {
  /**
   * SHA-256 (hex) dos bytes do ficheiro FINAL da foto, já com a marca de água.
   * Calcular só depois de a foto estar pronta: qualquer mudança no ficheiro
   * depois disto faz a prova deixar de bater certo.
   */
  return async function hashFoto(uri: string): Promise<string> {
    return sha256Hex(await lerBytes(uri));
  };
}

/** hashFoto("file:///.../foto.jpg") → "9f86d0...". */
export const hashFoto = criarHashFoto(async (uri) => {
  const ficheiro = new File(uri);
  if (!ficheiro.exists) throw new Error(`A foto não existe: ${uri}`);
  return ficheiro.bytes();
});
