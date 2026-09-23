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
  /** Esta chave já foi registada no servidor (para algum utilizador). */
  registada: boolean;
  criada_em: string;
}

interface LinhaChave {
  device_id: string;
  chave_publica_jwk: string;
  registada: 0 | 1;
  criada_em: string;
}

/** Campos de uma JWK que só existem em chaves privadas. */
const CAMPOS_PRIVADOS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];

function recusarPrivada(jwk: Record<string, unknown>): void {
  const privados = CAMPOS_PRIVADOS.filter((c) => c in jwk);
  if (privados.length > 0) {
    throw new Error(
      `Recusado: a chave tem campos privados (${privados.join(', ')}). ` +
        'A chave privada vai para o expo-secure-store, nunca para o SQLite.',
    );
  }
}

export function criarRepositorioChavesDispositivo(
  db: BaseDados,
  relogio: Relogio = relogioDoSistema,
) {
  return {
    async guardar(
      chave: Omit<ChaveDispositivo, 'criada_em' | 'registada'> & {
        registada?: boolean;
        criada_em?: string;
      },
    ): Promise<void> {
      recusarPrivada(chave.chave_publica_jwk);
      // INSERT OR REPLACE: uma chave nova volta a "não registada".
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
            criada_em: linha.criada_em,
          }
        : null;
    },

    async marcarRegistada(deviceId: string): Promise<void> {
      await db.run('UPDATE chaves_dispositivo SET registada = 1 WHERE device_id = ?', [deviceId]);
    },

    async apagar(deviceId: string): Promise<void> {
      await db.run('DELETE FROM chaves_dispositivo WHERE device_id = ?', [deviceId]);
    },

    /**
     * Chave pública que a app sabe estar registada no servidor para este
     * utilizador e aparelho (null se nunca foi registada por esta app).
     * Continua cá mesmo que a chave local mude: só muda com um registo novo.
     */
    async chaveNoServidor(userId: string, deviceId: string): Promise<Record<string, unknown> | null> {
      const linha = await db.getFirst<{ chave_publica_jwk: string }>(
        'SELECT chave_publica_jwk FROM chaves_no_servidor WHERE user_id = ? AND device_id = ?',
        [userId, deviceId],
      );
      return linha ? JSON.parse(linha.chave_publica_jwk) : null;
    },

    /** Chaves que a app sabe estarem no servidor para o utilizador, por device_id. */
    async chavesNoServidorDoUtilizador(userId: string): Promise<Record<string, Record<string, unknown>>> {
      const linhas = await db.getAll<{ device_id: string; chave_publica_jwk: string }>(
        'SELECT device_id, chave_publica_jwk FROM chaves_no_servidor WHERE user_id = ?',
        [userId],
      );
      return Object.fromEntries(linhas.map((l) => [l.device_id, JSON.parse(l.chave_publica_jwk)]));
    },

    /**
     * O servidor aceitou o registo desta chave para (utilizador, aparelho):
     * passa a ser a chave do servidor e a chave local fica "registada".
     */
    async registarNoServidor(
      userId: string,
      deviceId: string,
      jwk: Record<string, unknown>,
    ): Promise<void> {
      recusarPrivada(jwk);
      await db.transacao(async (tx) => {
        await tx.run(
          `INSERT OR REPLACE INTO chaves_no_servidor
             (user_id, device_id, chave_publica_jwk, registada_em)
           VALUES (?, ?, ?, ?)`,
          [userId, deviceId, paraJson(jwk), paraIso(relogio())],
        );
        // Só se a chave local for esta (compara x e y, não o texto JSON).
        await tx.run(
          `UPDATE chaves_dispositivo SET registada = 1
            WHERE device_id = ?
              AND json_extract(chave_publica_jwk, '$.x') IS ?
              AND json_extract(chave_publica_jwk, '$.y') IS ?`,
          [deviceId, String(jwk.x ?? ''), String(jwk.y ?? '')],
        );
      });
    },
  };
}

export type RepositorioChavesDispositivo = ReturnType<typeof criarRepositorioChavesDispositivo>;
