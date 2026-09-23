import initSqlJs, { type Database } from 'sql.js';

import { criarBaseDados, type MotorSql } from '../baseDados';
import type { BaseDados } from '../tipos';

/**
 * Adaptador de TESTE: a mesma interface BaseDados, mas servida pelo sql.js
 * (SQLite compilado para JavaScript/WebAssembly). Corre no computador e no
 * GitHub, sem telemóvel e sem compilação nativa. Não entra na app.
 */
export async function criarBaseDadosSqlJs(): Promise<{ db: BaseDados; sqljs: Database }> {
  const SQL = await initSqlJs();
  const sqljs = new SQL.Database();
  sqljs.exec('PRAGMA foreign_keys = ON;');
  return { db: criarBaseDados(criarMotorSqlJs(sqljs)), sqljs };
}

export function criarMotorSqlJs(sqljs: Database): MotorSql {
  // O expo-sqlite não aceita undefined; aqui recusamos também, para os
  // testes apanharem o erro em vez de gravarem NULL sem avisar.
  function validar(parametros: unknown[]): void {
    const i = parametros.indexOf(undefined);
    if (i >= 0) throw new Error(`Parâmetro ${i + 1} é undefined.`);
  }

  function todas<T>(sql: string, parametros: unknown[]): T[] {
    validar(parametros);
    const instrucao = sqljs.prepare(sql);
    try {
      instrucao.bind(parametros as never);
      const linhas: T[] = [];
      while (instrucao.step()) linhas.push(instrucao.getAsObject() as T);
      return linhas;
    } finally {
      instrucao.free();
    }
  }

  return {
    exec: async (sql) => {
      sqljs.exec(sql);
    },
    run: async (sql, parametros) => {
      validar(parametros);
      sqljs.run(sql, parametros as never);
      const alteracoes = sqljs.getRowsModified();
      const [linha] = todas<{ id: number }>('SELECT last_insert_rowid() AS id', []);
      return { alteracoes, ultimoId: linha?.id ?? 0 };
    },
    getAll: async (sql, parametros) => todas(sql, parametros),
    getFirst: async (sql, parametros) => todas<never>(sql, parametros)[0] ?? null,
  };
}
