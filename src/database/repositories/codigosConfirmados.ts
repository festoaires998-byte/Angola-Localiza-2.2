import type { BaseDados } from '../tipos';
import { paraIso, relogioDoSistema, type Relogio } from '../util';

/** Código Postal Digital confirmado pelo servidor para uma célula. */
export interface CodigoConfirmado {
  /** "SIGLA-GRELHA" (ex.: "HUA-MNFQPN2S"). */
  chave: string;
  codigo: string;
  latitude: number;
  longitude: number;
  confirmado_em: string;
}

export function criarRepositorioCodigosConfirmados(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    /** Guarda (ou substitui) o último código confirmado da célula. */
    async guardar(c: Omit<CodigoConfirmado, 'confirmado_em'>): Promise<CodigoConfirmado> {
      const confirmado_em = paraIso(relogio());
      await db.run(
        `INSERT OR REPLACE INTO codigos_confirmados (chave, codigo, latitude, longitude, confirmado_em)
         VALUES (?, ?, ?, ?, ?)`,
        [c.chave, c.codigo, c.latitude, c.longitude, confirmado_em],
      );
      return { ...c, confirmado_em };
    },

    async obter(chave: string): Promise<CodigoConfirmado | null> {
      return db.getFirst<CodigoConfirmado>('SELECT * FROM codigos_confirmados WHERE chave = ?', [chave]);
    },
  };
}

export type RepositorioCodigosConfirmados = ReturnType<typeof criarRepositorioCodigosConfirmados>;
