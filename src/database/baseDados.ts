import type { BaseDados, ResultadoRun, ValorSql } from './tipos';

/**
 * Operações "cruas" de um motor SQLite (expo-sqlite, sql.js, ...).
 * Não tratam de filas nem de transações: isso é feito em criarBaseDados().
 */
export interface MotorSql {
  exec(sql: string): Promise<void>;
  run(sql: string, parametros: ValorSql[]): Promise<ResultadoRun>;
  getAll<T>(sql: string, parametros: ValorSql[]): Promise<T[]>;
  getFirst<T>(sql: string, parametros: ValorSql[]): Promise<T | null>;
}

/**
 * Transforma um motor numa BaseDados com transações seguras.
 *
 * Há uma só ligação à base de dados. Para que uma operação de fora não se
 * meta a meio de uma transação, todas as chamadas passam por uma fila e
 * correm uma de cada vez. Uma transação ocupa a fila do princípio ao fim.
 *
 * Transações dentro de transações usam SAVEPOINT: se a de dentro falhar,
 * só essa parte é desfeita (e o erro continua a subir).
 */
export function criarBaseDados(motor: MotorSql): BaseDados {
  let fila: Promise<unknown> = Promise.resolve();

  function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = fila.then(tarefa, tarefa);
    fila = resultado.catch(() => undefined);
    return resultado;
  }

  async function executarTransacao<T>(
    funcao: (tx: BaseDados) => Promise<T>,
    profundidade: number,
  ): Promise<T> {
    const ponto = `ponto_${profundidade}`;
    await motor.exec(profundidade === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${ponto}`);
    try {
      const resultado = await funcao(dentroDaTransacao(profundidade));
      await motor.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${ponto}`);
      return resultado;
    } catch (erro) {
      await motor.exec(
        profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${ponto}; RELEASE ${ponto}`,
      );
      throw erro;
    }
  }

  function dentroDaTransacao(profundidade: number): BaseDados {
    return {
      exec: (sql) => motor.exec(sql),
      run: (sql, parametros = []) => motor.run(sql, parametros),
      getAll: (sql, parametros = []) => motor.getAll(sql, parametros),
      getFirst: (sql, parametros = []) => motor.getFirst(sql, parametros),
      transacao: (funcao) => executarTransacao(funcao, profundidade + 1),
    };
  }

  return {
    exec: (sql) => naFila(() => motor.exec(sql)),
    run: (sql, parametros = []) => naFila(() => motor.run(sql, parametros)),
    getAll: (sql, parametros = []) => naFila(() => motor.getAll(sql, parametros)),
    getFirst: (sql, parametros = []) => naFila(() => motor.getFirst(sql, parametros)),
    transacao: (funcao) => naFila(() => executarTransacao(funcao, 0)),
  };
}
