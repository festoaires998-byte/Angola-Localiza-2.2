import type { BaseDados } from '../tipos';
import { deJson, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/** Último perfil confirmado pelo servidor para um utilizador. */
export interface PerfilLocal {
  user_id: string;
  email: string | null;
  /** Cargos como vieram do servidor (texto). */
  cargos: string[];
  estado_kyc: string | null;
  confirmado_em: string;
}

interface LinhaPerfil {
  user_id: string;
  email: string | null;
  cargos_json: string;
  estado_kyc: string | null;
  confirmado_em: string;
}

export function criarRepositorioPerfilLocal(db: BaseDados, relogio: Relogio = relogioDoSistema) {
  return {
    async obter(userId: string): Promise<PerfilLocal | null> {
      const linha = await db.getFirst<LinhaPerfil>(
        'SELECT * FROM perfil_local WHERE user_id = ?',
        [userId],
      );
      if (!linha) return null;
      const cargos = deJson<unknown[]>(linha.cargos_json) ?? [];
      return {
        user_id: linha.user_id,
        email: linha.email,
        cargos: cargos.filter((c): c is string => typeof c === 'string'),
        estado_kyc: linha.estado_kyc,
        confirmado_em: linha.confirmado_em,
      };
    },

    /** Grava (ou substitui) o perfil acabado de confirmar pelo servidor. */
    async guardar(perfil: Omit<PerfilLocal, 'confirmado_em'>): Promise<PerfilLocal> {
      const confirmado_em = paraIso(relogio());
      await db.run(
        `INSERT INTO perfil_local (user_id, email, cargos_json, estado_kyc, confirmado_em)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           email = excluded.email, cargos_json = excluded.cargos_json,
           estado_kyc = excluded.estado_kyc, confirmado_em = excluded.confirmado_em`,
        [perfil.user_id, perfil.email, paraJson(perfil.cargos), perfil.estado_kyc, confirmado_em],
      );
      return { ...perfil, cargos: [...perfil.cargos], confirmado_em };
    },

    async apagar(userId: string): Promise<void> {
      await db.run('DELETE FROM perfil_local WHERE user_id = ?', [userId]);
    },
  };
}

export type RepositorioPerfilLocal = ReturnType<typeof criarRepositorioPerfilLocal>;
