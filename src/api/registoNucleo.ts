/** Leitura das respostas da Edge Function field-service (sem rede, testável). */

export interface Rua {
  id: string;
  nome: string;
}

export interface RuasDaQuadra {
  /** Código da quadra (ex.: "Q-11807-14361"): as ruas guardadas no telemóvel ficam por quadra. */
  quadra: string;
  /** A quadra já existe no servidor (já há registos nela) — "delimitada". */
  quadraMapeada: boolean;
  ruas: Rua[];
  /** Bairros já registados perto (até ~700 m), dos mais usados para os menos. */
  bairros: string[];
}

export interface Duplicado {
  distanciaM: number;
  codigoPostal: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/** field-service?action=list_streets_in_quadra */
export function lerRuasDaQuadra(resposta: unknown): RuasDaQuadra {
  const r = (resposta ?? {}) as {
    quadra_code?: unknown;
    quadra_id?: unknown;
    streets?: unknown;
    neighborhoods_nearby?: unknown;
    error?: unknown;
  };
  if (texto(r.error)) throw new Error(String(r.error));
  const quadra = texto(r.quadra_code);
  if (!quadra) throw new Error('Resposta do servidor sem quadra.');
  const ruas = (Array.isArray(r.streets) ? r.streets : [])
    .map((s: { id?: unknown; name?: unknown }) => ({ id: texto(s?.id), nome: texto(s?.name) }))
    .filter((s): s is Rua => s.id !== null && s.nome !== null);
  const bairros = [
    ...new Set((Array.isArray(r.neighborhoods_nearby) ? r.neighborhoods_nearby : []).map(texto).filter((b): b is string => b !== null)),
  ];
  // A função só devolve quadra_id quando a quadra já existe na base de dados.
  return { quadra, quadraMapeada: texto(r.quadra_id) !== null, ruas, bairros };
}

/** field-service?action=check_duplicates → null se não há morada a menos de 15 m. */
export function lerDuplicado(resposta: unknown): Duplicado | null {
  const r = (resposta ?? {}) as { found?: unknown; distance_meters?: unknown; postal_code?: unknown; error?: unknown };
  if (texto(r.error)) throw new Error(String(r.error));
  if (r.found !== true) return null;
  return {
    distanciaM: typeof r.distance_meters === 'number' ? r.distance_meters : 0,
    codigoPostal: texto(r.postal_code),
  };
}

/** Mesma conta da função (quadraCode): o código da quadra onde o ponto cai. */
export function codigoQuadra(latitude: number, longitude: number): string {
  return `Q${Math.floor(latitude / 0.001082)}-${Math.floor(longitude / 0.001096)}`;
}
