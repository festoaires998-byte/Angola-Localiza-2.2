/** Pequenas ajudas partilhadas pelos repositórios. */

/** Relógio que pode ser trocado nos testes. */
export type Relogio = () => Date;

export const relogioDoSistema: Relogio = () => new Date();

/** Data em texto ISO UTC, ex.: "2026-09-23T10:15:00.000Z". */
export function paraIso(data: Date): string {
  return data.toISOString();
}

/** Converte um valor em texto JSON para guardar numa coluna TEXT. */
export function paraJson(valor: unknown): string {
  return JSON.stringify(valor ?? null);
}

/** Lê uma coluna JSON (TEXT). Devolve null se estiver vazia. */
export function deJson<T = unknown>(texto: string | null | undefined): T | null {
  if (texto === null || texto === undefined || texto === '') return null;
  return JSON.parse(texto) as T;
}

/** Converte booleano para 0/1 (o SQLite não tem tipo booleano). */
export function paraBit(valor: boolean): 0 | 1 {
  return valor ? 1 : 0;
}

/** Cria "?, ?, ?" com n pontos de interrogação. */
export function marcadores(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}
