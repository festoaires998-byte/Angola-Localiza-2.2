import type { BaseDados } from '../tipos';
import { migracao001 } from './001_inicial';
import { migracao002 } from './002_perfil_e_utilizador';
import { migracao003 } from './003_chaves_e_evidencias';
import type { Migracao } from './tipos';

export type { Migracao } from './tipos';

/** Todas as migrações, por ordem. Uma nova migração entra no fim desta lista. */
export const MIGRACOES: readonly Migracao[] = [migracao001, migracao002, migracao003];

/** Versão em que a base de dados está agora (PRAGMA user_version). */
export async function lerVersao(db: BaseDados): Promise<number> {
  const linha = await db.getFirst<{ user_version: number }>('PRAGMA user_version');
  return linha?.user_version ?? 0;
}

/**
 * Aplica, por ordem, as migrações que ainda faltam.
 *
 * Cada migração corre dentro de uma transação, junto com a mudança do
 * user_version. Se falhar, essa migração é desfeita por inteiro e a versão
 * fica na anterior; as seguintes não chegam a correr.
 *
 * Devolve a versão final.
 */
export async function aplicarMigracoes(
  db: BaseDados,
  migracoes: readonly Migracao[] = MIGRACOES,
): Promise<number> {
  validarLista(migracoes);
  let versao = await lerVersao(db);
  for (const migracao of migracoes) {
    if (migracao.versao <= versao) continue;
    try {
      await db.transacao(async (tx) => {
        await migracao.aplicar(tx);
        // user_version só aceita um número literal (não aceita "?").
        await tx.exec(`PRAGMA user_version = ${Math.trunc(migracao.versao)}`);
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new Error(`Migração ${migracao.versao} (${migracao.nome}) falhou: ${motivo}`);
    }
    versao = migracao.versao;
  }
  return versao;
}

function validarLista(migracoes: readonly Migracao[]): void {
  migracoes.forEach((m, i) => {
    if (m.versao !== i + 1) {
      throw new Error(
        `Migrações fora de ordem: na posição ${i + 1} está a versão ${m.versao}.`,
      );
    }
  });
}
