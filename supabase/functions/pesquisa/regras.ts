// Angola Localiza - Pesquisa: regras puras (sem Deno, sem base de dados).
// Usadas pela Edge Function (index.ts) E pelos testes da app. Não importar nada aqui.
//
// A pesquisa lê com a service role (passa por cima das regras da base de dados),
// por isso é aqui que se decide o que cada pessoa pode ver:
// - só moradas aprovadas, oficiais ou publicadas;
// - uma morada "Privada" só aparece a quem a criou;
// - nunca devolve contactos, quem criou nem outros dados internos.

/** Estados de morada que se podem encontrar (os mesmos da resolve-address). */
export const ESTADOS_PUBLICOS = ["APPROVED", "OFFICIAL", "PUBLISHED"] as const;

export const MIN_TEXTO = 3;
export const MAX_TEXTO = 80;
/** Máximo de resultados devolvidos (e pedidos a cada tabela). */
export const MAX_RESULTADOS = 8;

/** AO-HUA-MNFQR6JW-41, com o "-2" opcional que o servidor junta quando a célula já tem moradas. */
const CODIGO_POSTAL = /^AO-[A-Z]{3}-[2-9A-HJ-NP-Z]{8}-\d{2}(-\d{1,3})?$/;
/** Plus Code completo (8FVC9G8F+6X) ou curto (9G8F+6X). */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3}$/;

export type Pedido =
  | { tipo: "codigo_postal"; valor: string }
  | { tipo: "plus_code"; valor: string }
  | { tipo: "rua_numero"; rua: string; numero: string }
  | { tipo: "texto"; valor: string };

/** Lê o que a pessoa escreveu. null = pesquisa inválida (vazia, curta ou longa demais). */
export function interpretar(entrada: unknown): Pedido | null {
  if (typeof entrada !== "string") return null;
  const q = entrada.replace(/\s+/g, " ").trim();
  if (q.length < MIN_TEXTO || q.length > MAX_TEXTO) return null;
  const maiusculas = q.toUpperCase();
  if (CODIGO_POSTAL.test(maiusculas)) return { tipo: "codigo_postal", valor: maiusculas };
  if (PLUS_CODE.test(maiusculas.replace(/\s/g, ""))) return { tipo: "plus_code", valor: maiusculas.replace(/\s/g, "") };
  // "Rua da Missão, 12" → rua + número de porta (como no site).
  const virgula = q.lastIndexOf(",");
  if (virgula > 0) {
    const rua = q.slice(0, virgula).trim();
    const numero = q.slice(virgula + 1).trim();
    if (rua.length >= MIN_TEXTO && /^\d[\dA-Za-z/-]{0,9}$/.test(numero)) return { tipo: "rua_numero", rua, numero };
  }
  return { tipo: "texto", valor: q };
}

/** Padrão para ilike com o texto tal e qual (os %, _ e \ escritos pela pessoa não são curingas). */
export function padraoContem(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface MoradaLida {
  id: string;
  postal_code: string | null;
  plus_code: string | null;
  house_number: string | null;
  reference: string | null;
  status: string | null;
  visibility_level: string | null;
  created_by: string | null;
  latitude: number | null;
  longitude: number | null;
  street_id: string | null;
  neighborhood_id: string | null;
}

/** Colunas lidas das moradas (created_by só serve para decidir; não sai na resposta). */
export const CAMPOS_MORADA =
  "id, postal_code, plus_code, house_number, reference, status, visibility_level, created_by, latitude, longitude, street_id, neighborhood_id";

/** A pessoa pode ver esta morada na pesquisa? */
export function podeVer(m: Pick<MoradaLida, "status" | "visibility_level" | "created_by">, quemPede: string): boolean {
  if (!(ESTADOS_PUBLICOS as readonly string[]).includes(m.status ?? "")) return false;
  return m.visibility_level !== "PRIVATE" || m.created_by === quemPede;
}

export interface Resultado {
  tipo: "morada" | "rua" | "bairro";
  id: string;
  titulo: string;
  subtitulo: string | null;
  latitude: number | null;
  longitude: number | null;
  codigo_postal: string | null;
  plus_code: string | null;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function resultadoMorada(m: MoradaLida, nomeRua: string | null): Resultado {
  const linha = [nomeRua, m.house_number ? `nº ${m.house_number}` : null].filter(Boolean).join(", ");
  return {
    tipo: "morada",
    id: m.id,
    titulo: m.postal_code ?? m.plus_code ?? "Morada sem código",
    subtitulo: [linha || null, m.reference].filter(Boolean).join(" · ") || null,
    latitude: numero(m.latitude),
    longitude: numero(m.longitude),
    codigo_postal: m.postal_code,
    plus_code: m.plus_code,
  };
}

export function resultadoLugar(
  tipo: "rua" | "bairro",
  id: string,
  nome: string,
  subtitulo: string | null,
  posicao: { latitude: number; longitude: number } | null,
): Resultado {
  return {
    tipo,
    id,
    titulo: nome,
    subtitulo,
    latitude: posicao?.latitude ?? null,
    longitude: posicao?.longitude ?? null,
    codigo_postal: null,
    plus_code: null,
  };
}

/** Tira os repetidos (mesmo tipo e id) e corta no máximo. */
export function juntarResultados(listas: Resultado[][]): Resultado[] {
  const vistos = new Set<string>();
  const saida: Resultado[] = [];
  for (const r of listas.flat()) {
    const chave = `${r.tipo}:${r.id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(r);
    if (saida.length >= MAX_RESULTADOS) break;
  }
  return saida;
}
