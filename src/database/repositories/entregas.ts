import type { BaseDados } from '../tipos';
import { deJson, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/** Uma entrega. O estado vem do servidor, por isso é texto livre. */
export interface Entrega {
  id: string;
  estado: string;
  dados: unknown;
  atualizado_em: string;
}

interface LinhaEntrega extends Omit<Entrega, 'dados'> {
  dados_json: string | null;
}

function deLinha({ dados_json, ...resto }: LinhaEntrega): Entrega {
  return { ...resto, dados: deJson(dados_json) };
}

export function criarRepositorioEntregas(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  async function inserir(tx: BaseDados, e: Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string }) {
    await tx.run(
      `INSERT OR REPLACE INTO entregas (id, estado, dados_json, atualizado_em) VALUES (?, ?, ?, ?)`,
      [
        e.id,
        e.estado,
        e.dados === undefined || e.dados === null ? null : paraJson(e.dados),
        e.atualizado_em ?? paraIso(relogio()),
      ],
    );
  }

  return {
    guardar(entrega: Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string }): Promise<void> {
      return inserir(db, entrega);
    },

    async guardarVarias(
      entregas: (Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string })[],
    ): Promise<void> {
      if (entregas.length === 0) return;
      await db.transacao(async (tx) => {
        for (const e of entregas) await inserir(tx, e);
      });
    },

    async obter(id: string): Promise<Entrega | null> {
      const linha = await db.getFirst<LinhaEntrega>('SELECT * FROM entregas WHERE id = ?', [id]);
      return linha ? deLinha(linha) : null;
    },

    async listar(estado?: string): Promise<Entrega[]> {
      const linhas = estado
        ? await db.getAll<LinhaEntrega>(
            'SELECT * FROM entregas WHERE estado = ? ORDER BY atualizado_em DESC',
            [estado],
          )
        : await db.getAll<LinhaEntrega>('SELECT * FROM entregas ORDER BY atualizado_em DESC');
      return linhas.map(deLinha);
    },

    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM entregas WHERE id = ?', [id]);
    },
  };
}

export type RepositorioEntregas = ReturnType<typeof criarRepositorioEntregas>;
