import type { BaseDados } from '../tipos';
import { paraIso, relogioDoSistema, type Relogio } from '../util';

/** Pequenos valores guardados no telemóvel (chave → texto). */
export function criarRepositorioPreferencias(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    async obter(chave: string): Promise<string | null> {
      const linha = await db.getFirst<{ valor: string }>('SELECT valor FROM preferencias WHERE chave = ?', [chave]);
      return linha?.valor ?? null;
    },

    async apagar(chave: string): Promise<void> {
      await db.run('DELETE FROM preferencias WHERE chave = ?', [chave]);
    },

    async guardar(chave: string, valor: string): Promise<void> {
      await db.run('INSERT OR REPLACE INTO preferencias (chave, valor, atualizado_em) VALUES (?, ?, ?)', [
        chave,
        valor,
        paraIso(relogio()),
      ]);
    },
  };
}

export type RepositorioPreferencias = ReturnType<typeof criarRepositorioPreferencias>;
