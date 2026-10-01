import type { BaseDados } from '../tipos';

/** Um erro guardado no telemóvel, à espera de ir para o servidor. */
export interface ErroPendente {
  id: string;
  mensagem: string;
  pilha: string | null;
  fatal: boolean;
  ecra: string | null;
  ocorreu_em: string;
}

interface Linha {
  id: string;
  mensagem: string;
  pilha: string | null;
  fatal: number;
  ecra: string | null;
  ocorreu_em: string;
}

const deLinha = (l: Linha): ErroPendente => ({ ...l, fatal: l.fatal === 1 });

export function criarRepositorioErrosPendentes(db: BaseDados) {
  return {
    async guardar(e: ErroPendente): Promise<void> {
      await db.run(
        `INSERT OR IGNORE INTO erros_pendentes (id, mensagem, pilha, fatal, ecra, ocorreu_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [e.id, e.mensagem, e.pilha, e.fatal ? 1 : 0, e.ecra, e.ocorreu_em],
      );
    },

    /** Os mais antigos primeiro. */
    async listar(limite = 50): Promise<ErroPendente[]> {
      const linhas = await db.getAll<Linha>(
        'SELECT * FROM erros_pendentes ORDER BY ocorreu_em, id LIMIT ?',
        [Math.max(0, Math.trunc(limite))],
      );
      return linhas.map(deLinha);
    },

    async contar(): Promise<number> {
      const r = await db.getFirst<{ n: number }>('SELECT count(*) AS n FROM erros_pendentes');
      return r?.n ?? 0;
    },

    async apagar(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db.run(`DELETE FROM erros_pendentes WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
    },

    /** Deixa só os `maximo` mais recentes. */
    async limitar(maximo: number): Promise<void> {
      await db.run(
        `DELETE FROM erros_pendentes WHERE id NOT IN
           (SELECT id FROM erros_pendentes ORDER BY ocorreu_em DESC, id DESC LIMIT ?)`,
        [Math.max(0, Math.trunc(maximo))],
      );
    },
  };
}

export type RepositorioErrosPendentes = ReturnType<typeof criarRepositorioErrosPendentes>;
