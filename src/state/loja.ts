/**
 * Loja mínima para usar com useSyncExternalStore (sem bibliotecas de estado).
 * O estado é substituído por inteiro em cada mudança (nunca alterado no lugar),
 * para o React perceber que mudou.
 */
export interface Loja<T> {
  obter(): T;
  definir(novo: T | ((anterior: T) => T)): void;
  subscrever(ouvinte: () => void): () => void;
}

export function criarLoja<T>(inicial: T): Loja<T> {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  return {
    obter: () => estado,
    definir(novo) {
      const proximo = typeof novo === 'function' ? (novo as (a: T) => T)(estado) : novo;
      if (Object.is(proximo, estado)) return;
      estado = proximo;
      ouvintes.forEach((o) => o());
    },
    subscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}
