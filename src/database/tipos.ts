/**
 * Interface pequena da base de dados local.
 *
 * Os repositórios só conhecem esta interface. No telemóvel ela é servida
 * pelo expo-sqlite (ver client.ts); nos testes é servida pelo sql.js
 * (ver testes/baseDadosSqlJs.ts). Assim o mesmo código corre nos dois lados.
 */

/** Valores que podem ser passados como parâmetros "?" de uma instrução SQL. */
export type ValorSql = string | number | null | Uint8Array;

/** O que uma instrução de escrita (INSERT/UPDATE/DELETE) devolve. */
export interface ResultadoRun {
  /** Quantas linhas foram alteradas. */
  alteracoes: number;
  /** rowid da última linha inserida (pouco útil: as nossas chaves são texto). */
  ultimoId: number;
}

export interface BaseDados {
  /** Corre uma ou mais instruções SQL sem parâmetros (ex.: CREATE TABLE). */
  exec(sql: string): Promise<void>;
  /** Corre uma instrução de escrita com parâmetros. */
  run(sql: string, parametros?: ValorSql[]): Promise<ResultadoRun>;
  /** Devolve todas as linhas de uma consulta. */
  getAll<T>(sql: string, parametros?: ValorSql[]): Promise<T[]>;
  /** Devolve a primeira linha de uma consulta, ou null se não houver. */
  getFirst<T>(sql: string, parametros?: ValorSql[]): Promise<T | null>;
  /**
   * Corre várias operações como um bloco só: ou ficam todas gravadas,
   * ou (se alguma falhar) nenhuma fica.
   *
   * IMPORTANTE: dentro da função use SEMPRE o `tx` recebido, nunca a base
   * de dados de fora. A base de fora espera que a transação acabe, por isso
   * usá-la lá dentro deixaria a aplicação à espera para sempre.
   */
  transacao<T>(funcao: (tx: BaseDados) => Promise<T>): Promise<T>;
}
