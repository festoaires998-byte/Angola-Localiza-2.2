/**
 * O @noble usa globalThis.crypto.getRandomValues para gerar chaves. O Hermes
 * (motor de JavaScript do React Native) não o tem: liga-o ao gerador do
 * sistema (expo-crypto). Chamar antes de gerar chaves.
 */
export function garantirGetRandomValues(
  getRandomValues: (matriz: Uint8Array) => Uint8Array,
): void {
  const g = globalThis as { crypto?: { getRandomValues?: unknown } };
  if (typeof g.crypto?.getRandomValues === 'function') return;
  if (!g.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
      enumerable: false,
      writable: true,
    });
  }
  (g.crypto as { getRandomValues: unknown }).getRandomValues = getRandomValues;
}
