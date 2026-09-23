/** Base64 e base64url sem depender de atob/btoa (nem sempre existem no Hermes). */

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALOR = new Map([...ALFABETO].map((c, i) => [c, i]));

/** Base64 normal, com "=" no fim (é o que o servidor lê com atob). */
export function paraBase64(bytes: Uint8Array): string {
  let saida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const faltam = Math.max(0, i + 3 - bytes.length);
    saida += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
    saida += faltam >= 2 ? '=' : ALFABETO[(n >> 6) & 63];
    saida += faltam >= 1 ? '=' : ALFABETO[n & 63];
  }
  return saida;
}

/** Lê base64 normal (com ou sem "="). Lança erro se tiver caracteres inválidos. */
export function deBase64(texto: string): Uint8Array {
  const limpo = texto.replace(/=+$/, '');
  if (limpo.length % 4 === 1) throw new Error('Base64 inválido.');
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const c of limpo) {
    const v = VALOR.get(c);
    if (v === undefined) throw new Error('Base64 inválido.');
    acumulado = (acumulado << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Base64url sem "=" (formato dos campos x e y de uma JWK). */
export function paraBase64Url(bytes: Uint8Array): string {
  return paraBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(texto: string): Uint8Array {
  if (/[+/=]/.test(texto)) throw new Error('Base64url inválido.');
  return deBase64(texto.replace(/-/g, '+').replace(/_/g, '/'));
}
