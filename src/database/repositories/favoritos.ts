import type { BaseDados } from '../tipos';
import { paraIso, relogioDoSistema, type Relogio } from '../util';

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

export interface Favorito {
  id: string;
  morada_id: string;
  nome: string;
  categoria: CategoriaFavorito;
  atualizado_em: string;
}

export function criarRepositorioFavoritos(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    async guardar(
      favorito: Omit<Favorito, 'atualizado_em'> & { atualizado_em?: string },
    ): Promise<void> {
      await db.run(
        `INSERT OR REPLACE INTO favoritos (id, morada_id, nome, categoria, atualizado_em)
         VALUES (?, ?, ?, ?, ?)`,
        [
          favorito.id,
          favorito.morada_id,
          favorito.nome,
          favorito.categoria,
          favorito.atualizado_em ?? paraIso(relogio()),
        ],
      );
    },

    obter(id: string): Promise<Favorito | null> {
      return db.getFirst<Favorito>('SELECT * FROM favoritos WHERE id = ?', [id]);
    },

    /** Todos os favoritos, ou só os de uma categoria, por nome. */
    listar(categoria?: CategoriaFavorito): Promise<Favorito[]> {
      return categoria
        ? db.getAll<Favorito>(
            'SELECT * FROM favoritos WHERE categoria = ? ORDER BY nome COLLATE NOCASE',
            [categoria],
          )
        : db.getAll<Favorito>('SELECT * FROM favoritos ORDER BY nome COLLATE NOCASE');
    },

    listarPorMorada(moradaId: string): Promise<Favorito[]> {
      return db.getAll<Favorito>('SELECT * FROM favoritos WHERE morada_id = ?', [moradaId]);
    },

    async apagar(id: string): Promise<void> {
      await db.run('DELETE FROM favoritos WHERE id = ?', [id]);
    },
  };
}

export type RepositorioFavoritos = ReturnType<typeof criarRepositorioFavoritos>;
