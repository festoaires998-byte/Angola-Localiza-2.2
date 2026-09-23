import type { BaseDados } from '../tipos';
import { paraIso, relogioDoSistema, type Relogio } from '../util';

/** As mesmas categorias do servidor (CHECK de public.favorites.category). */
export const CATEGORIAS_FAVORITO = [
  'casa',
  'trabalho',
  'familia',
  'cliente',
  'loja',
  'entrega',
  'outro',
] as const;
export type CategoriaFavorito = (typeof CATEGORIAS_FAVORITO)[number];

export function eCategoriaFavorito(valor: unknown): valor is CategoriaFavorito {
  return typeof valor === 'string' && (CATEGORIAS_FAVORITO as readonly string[]).includes(valor);
}

/** Alteração feita no telemóvel que ainda não chegou ao servidor. */
export type PendenteFavorito = 'atualizar' | 'remover';

export interface Favorito {
  /** O mesmo id do servidor (public.favorites.id). */
  id: string;
  user_id: string | null;
  morada_id: string;
  /** Nome dado pela pessoa (ex.: "Casa da avó"); '' se não deu nenhum. */
  nome: string;
  categoria: CategoriaFavorito;
  pendente: PendenteFavorito | null;
  criado_em: string | null;
  atualizado_em: string;
}

export type FavoritoNovo = Omit<Favorito, 'atualizado_em' | 'pendente' | 'criado_em'> & {
  pendente?: PendenteFavorito | null;
  criado_em?: string | null;
  atualizado_em?: string;
};

export function criarRepositorioFavoritos(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  async function inserir(tx: BaseDados, f: FavoritoNovo): Promise<void> {
    await tx.run(
      `INSERT OR REPLACE INTO favoritos
         (id, user_id, morada_id, nome, categoria, pendente, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.id,
        f.user_id,
        f.morada_id,
        f.nome,
        f.categoria,
        f.pendente ?? null,
        f.criado_em ?? null,
        f.atualizado_em ?? paraIso(relogio()),
      ],
    );
  }

  return {
    guardar(favorito: FavoritoNovo): Promise<void> {
      return inserir(db, favorito);
    },

    obter(id: string): Promise<Favorito | null> {
      return db.getFirst<Favorito>('SELECT * FROM favoritos WHERE id = ?', [id]);
    },

    /**
     * Os favoritos do utilizador (sem os que ele tirou sem rede), os mais
     * recentes primeiro; só os de uma categoria, se for dada.
     */
    listarDoUtilizador(userId: string, categoria?: CategoriaFavorito): Promise<Favorito[]> {
      const filtro = categoria ? 'AND categoria = ?' : '';
      return db.getAll<Favorito>(
        `SELECT * FROM favoritos
          WHERE user_id = ? AND (pendente IS NULL OR pendente <> 'remover') ${filtro}
          ORDER BY criado_em DESC, nome COLLATE NOCASE`,
        categoria ? [userId, categoria] : [userId],
      );
    },

    /** Os que têm alterações à espera de rede. */
    listarPendentes(userId: string): Promise<Favorito[]> {
      return db.getAll<Favorito>(
        'SELECT * FROM favoritos WHERE user_id = ? AND pendente IS NOT NULL ORDER BY atualizado_em',
        [userId],
      );
    },

    listarPorMorada(moradaId: string): Promise<Favorito[]> {
      return db.getAll<Favorito>('SELECT * FROM favoritos WHERE morada_id = ?', [moradaId]);
    },

    /** Muda o nome/categoria no telemóvel e marca para enviar. */
    async alterar(id: string, mudancas: { nome: string; categoria: CategoriaFavorito }): Promise<void> {
      await db.run(
        `UPDATE favoritos SET nome = ?, categoria = ?, atualizado_em = ?,
            pendente = CASE WHEN pendente = 'remover' THEN 'remover' ELSE 'atualizar' END
          WHERE id = ?`,
        [mudancas.nome, mudancas.categoria, paraIso(relogio()), id],
      );
    },

    /** Tira dos favoritos no telemóvel (deixa de aparecer) e marca para enviar. */
    async marcarRemover(id: string): Promise<void> {
      await db.run(`UPDATE favoritos SET pendente = 'remover', atualizado_em = ? WHERE id = ?`, [
        paraIso(relogio()),
        id,
      ]);
    },

    /** O servidor já tem esta alteração. */
    async marcarEnviado(id: string): Promise<void> {
      await db.run('UPDATE favoritos SET pendente = NULL WHERE id = ?', [id]);
    },

    /**
     * Troca os favoritos do utilizador pelos do servidor, numa transação.
     * Os que têm alterações à espera de rede ficam como estão no telemóvel
     * (a alteração local ainda não chegou ao servidor).
     */
    async substituirDoServidor(userId: string, doServidor: FavoritoNovo[]): Promise<void> {
      await db.transacao(async (tx) => {
        const pendentes = await tx.getAll<{ id: string }>(
          'SELECT id FROM favoritos WHERE user_id = ? AND pendente IS NOT NULL',
          [userId],
        );
        const manter = new Set(pendentes.map((p) => p.id));
        await tx.run('DELETE FROM favoritos WHERE user_id = ? AND pendente IS NULL', [userId]);
        for (const f of doServidor) {
          if (!manter.has(f.id)) await inserir(tx, { ...f, user_id: userId, pendente: null });
        }
      });
    },

    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM favoritos WHERE id = ?', [id]);
    },
  };
}

export type RepositorioFavoritos = ReturnType<typeof criarRepositorioFavoritos>;
