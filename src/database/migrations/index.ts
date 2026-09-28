import type { BaseDados } from '../tipos';
import { migracao001 } from './001_inicial';
import { migracao002 } from './002_perfil_e_utilizador';
import { migracao003 } from './003_chaves_e_evidencias';
import { migracao004 } from './004_avisos_vistos';
import { migracao005 } from './005_zonas_geocodificadas';
import { migracao006 } from './006_codigos_confirmados';
import { migracao007 } from './007_favoritos_do_utilizador';
import { migracao008 } from './008_preferencias';
import { migracao009 } from './009_favoritos_criados_sem_rede';
import { migracao010 } from './010_historico_localiza';
import type { Migracao } from './tipos';

export type { Migracao } from './tipos';

/** Todas as migrações, por ordem. Uma nova migração entra no fim desta lista. */
export const MIGRACOES: readonly Migracao[] = [migracao001, migracao002, migracao003, migracao004, migracao005, migracao006, migracao007, migracao008, migracao009, migracao010];

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