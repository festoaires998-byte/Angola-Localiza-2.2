import * as SQLite from 'expo-sqlite';

import { criarBaseDados, type MotorSql } from './baseDados';
import { aplicarMigracoes } from './migrations';
import type { BaseDados } from './tipos';

export type { BaseDados, ResultadoRun, ValorSql } from './tipos';

/** Nome do ficheiro da base de dados no telemóvel. */
export const NOME_BASE_DADOS = 'angola_localiza.db';

let aberta: Promise<BaseDados> | null = null;

/**
 * Abre a base de dados local (só na primeira chamada; depois devolve a mesma),
 * liga o modo WAL e as chaves estrangeiras e aplica as migrações em falta.
 */
export function abrirBaseDados(): Promise<BaseDados> {
  if (!aberta) {
    aberta = (async () => {
      const nativa = await SQLite.openDatabaseAsync(NOME_BASE_DADOS);
      // Tem de ser fora de qualquer transação: dentro de uma, o SQLite ignora-os.
      await nativa.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const db = criarBaseDados(criarMotorExpo(nativa));
      await aplicarMigracoes(db);
      return db;
    })().catch((erro) => {
      // Se falhar, a próxima chamada tenta de novo em vez de ficar presa no erro.
      aberta = null;
      throw erro;
    });
  }
  return aberta;
}

/** Adaptador: liga a interface MotorSql ao expo-sqlite. */
export function criarMotorExpo(nativa: SQLite.SQLiteDatabase): MotorSql {
  return {
    exec: (sql) => nativa.execAsync(sql),
    run: async (sql, parametros) => {
      const r = await nativa.runAsync(sql, parametros);
      return { alteracoes: r.changes, ultimoId: r.lastInsertRowId };
    },
    getAll: (sql, parametros) => nativa.getAllAsync(sql, parametros),
    getFirst: (sql, parametros) => nativa.getFirstAsync(sql, parametros),
  };
}
