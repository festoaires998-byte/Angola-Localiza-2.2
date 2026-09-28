import type { BaseDados } from '../tipos';
import { paraIso, relogioDoSistema, type Relogio } from '../util';

export interface ItemHistoricoLocaliza {
  id: string;
  titulo: string;
  latitude: number;
  longitude: number;
  subtitulo: string | null;
  atualizado_em: string;
}

export function criarRepositorioHistoricoLocaliza(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  async function aparar(tx: BaseDados): Promise<void> {
    await tx.run(`DELETE FROM historico_localiza WHERE id NOT IN (
      SELECT id FROM historico_localiza ORDER BY atualizado_em DESC LIMIT 20
    )`);
  }
  return {
    async registar(item: Omit<ItemHistoricoLocaliza, 'atualizado_em'>): Promise<void> {
      await db.transacao(async (tx) => {
        await tx.run('DELETE FROM historico_localiza WHERE id = ?', [item.id]);
        await tx.run(
          'INSERT INTO historico_localiza (id,titulo,latitude,longitude,subtitulo,atualizado_em) VALUES (?,?,?,?,?,?)',
          [item.id, item.titulo, item.latitude, item.longitude, item.subtitulo ?? null, paraIso(relogio())],
        );
        await aparar(tx);
      });
    },
    listar(): Promise<ItemHistoricoLocaliza[]> {
      return db.getAll<ItemHistoricoLocaliza>('SELECT * FROM historico_localiza ORDER BY atualizado_em DESC LIMIT 20');
    },
    async limpar(): Promise<void> {
      await db.run('DELETE FROM historico_localiza');
    },
  };
}
export type RepositorioHistoricoLocaliza = ReturnType<typeof criarRepositorioHistoricoLocaliza>;
