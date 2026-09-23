import type { BaseDados } from '../tipos';
import { paraBit, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/**
 * Chave PÚBLICA do dispositivo.
 *
 * NUNCA guardar aqui a chave privada. A chave privada vai para o
 * expo-secure-store (src/services/crypto). Esta base de dados não é cifrada.
 */
export interface ChaveDispositivo {
  device_id: string;
  /** Chave pública em formato JWK. */
  chave_publica_jwk: Record<string, unknown>;
  registada: boolean;
  /** Utilizador para quem a chave foi registada no servidor (null se ainda não se sabe). */
  registada_user_id: string | null;
  criada_em: string;
}

interface LinhaChave {
  device_id: string;
  chave_publica_jwk: string;
  registada: 0 | 1;
  registada_user_id: string | null;
  criada_em: string;
}

/** Campos de uma JWK que só existem em chaves privadas. */
const CAMPOS_PRIVADOS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];

export function criarRepositorioChavesDispositivo(
  db: BaseDados,
  relogio: Relogio = relogioDoSistema,
) {
  return {
    async guardar(
      chave: Omit<ChaveDispositivo, 'criada_em' | 'registada' | 'registada_user_id'> & {
        registada?: boolean;
        criada_em?: string;
      },
    ): Promise<void> {
      const privados = CAMPOS_PRIVADOS.filter((c) => c in chave.chave_publica_jwk);
      if (privados.length > 0) {
        throw new Error(
          `Recusado: a chave tem campos privados (${privados.join(', ')}). ` +
            'A chave privada vai para o expo-secure-store, nunca para o SQLite.',
        );
      }
      // INSERT OR REPLACE: uma chave nova apaga o registo da anterior
      // (registada e registada_user_id voltam ao início).
      await db.run(
        `INSERT OR REPLACE INTO chaves_dispositivo
           (device_id, chave_publica_jwk, registada, criada_em)
         VALUES (?, ?, ?, ?)`,
        [
          chave.device_id,
          paraJson(chave.chave_publica_jwk),
          paraBit(chave.registada ?? false),
          chave.criada_em ?? paraIso(relogio()),
        ],
      );
    },

    async obter(deviceId: string): Promise<ChaveDispositivo | null> {
      const linha = await db.getFirst<LinhaChave>(
        'SELECT * FROM chaves_dispositivo WHERE device_id = ?',
        [deviceId],
      );
      return linha
        ? {
            device_id: linha.device_id,
            chave_publica_jwk: JSON.parse(linha.chave_publica_jwk),
            registada: linha.registada === 1,
            registada_user_id: linha.registada_user_id ?? null,
            criada_em: linha.criada_em,
          }
        : null;
    },

    /** Marca a chave como registada no servidor (para o utilizador `userId`, se indicado). */
    async marcarRegistada(deviceId: string, userId: string | null = null): Promise<void> {
      await db.run(
        'UPDATE chaves_dispositivo SET registada = 1, registada_user_id = ? WHERE device_id = ?',
        [userId, deviceId],
      );
    },

    async apagar(deviceId: string): Promise<void> {
      await db.run('DELETE FROM chaves_dispositivo WHERE device_id = ?', [deviceId]);
    },
  };
}

export type RepositorioChavesDispositivo = ReturnType<typeof criarRepositorioChavesDispositivo>;
