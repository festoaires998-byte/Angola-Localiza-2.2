/**
 * Avisos simples entre o motor de sincronização e o resto da app.
 * - "sincronizado": acabou uma volta de envio (os ecrãs voltam a ler a fila).
 * - "operacaoAcrescentada": entrou uma operação nova na fila.
 */
export type EventoSync = 'sincronizado' | 'operacaoAcrescentada';

export interface Emissor {
  emitir(evento: EventoSync): void;
  /** Devolve "deixar de ouvir". */
  ouvir(evento: EventoSync, ouvinte: () => void): () => void;
}

export function criarEmissor(): Emissor {
  const ouvintes = new Map<EventoSync, Set<() => void>>();
  return {
    emitir(evento) {
      // Copia antes: um ouvinte pode deixar de ouvir durante o aviso.
      [...(ouvintes.get(evento) ?? [])].forEach((o) => {
        try {
          o();
        } catch {
          // Um ecrã com erro não pode parar o motor.
        }
      });
    },
    ouvir(evento, ouvinte) {
      const lista = ouvintes.get(evento) ?? new Set();
      lista.add(ouvinte);
      ouvintes.set(evento, lista);
      return () => {
        lista.delete(ouvinte);
      };
    },
  };
}

/** Emissor partilhado pela app. */
export const eventosSync = criarEmissor();
