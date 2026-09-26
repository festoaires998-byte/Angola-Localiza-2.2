// Angola Localiza - Sync: regras puras (sem Deno, sem base de dados).
// Usadas pela Edge Function (index.ts) E pelos testes da app. Não importar nada aqui.
//
// A sync grava com a service role (passa por cima das regras da base de dados),
// por isso só deixa passar os campos que uma pessoa pode escolher. O estado da
// morada, a validação, a confiança e a revisão só mudam pela field-service.

/** Uma morada criada pela sync fica sempre por validar. */
export const ESTADO_INICIAL = "PROPOSED";

/** Campos que quem cria a morada pode preencher (além da latitude e da longitude). */
export const CAMPOS_MORADA = [
  "plus_code", "postal_code", "zip_code", "accuracy_meters",
  "province_id", "municipality_id", "commune_id", "neighborhood_id", "street_id",
  "house_number", "reference", "visibility_level", "photo_url",
] as const;

/** Campos que só a validação (field-service) ou o servidor mudam: se vierem, a operação é recusada. */
export const CAMPOS_PROIBIDOS = [
  "validated_by", "validated_at", "confidence_score", "flagged_for_review", "public_id",
  "postal_code_scheme_id", "postal_code_version", "submitted_by_role", "number_origin", "quadra_id",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS_UUID = new Set(["province_id", "municipality_id", "commune_id", "neighborhood_id", "street_id"]);
const MAX_TEXTO = 500;

export type Limpeza = { ok: true; linha: Record<string, unknown> } | { ok: false; erro: string };

export function eUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

function objeto(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

function presente(v: unknown) {
  return v !== undefined && v !== null;
}

/** Copia só os campos permitidos, com o tipo certo. */
function camposPermitidos(p: Record<string, unknown>): Limpeza {
  for (const c of CAMPOS_PROIBIDOS) {
    if (presente(p[c])) return { ok: false, erro: `o campo ${c} so muda na validacao` };
  }
  const linha: Record<string, unknown> = {};
  for (const c of CAMPOS_MORADA) {
    const v = p[c];
    if (v === undefined) continue;
    if (v === null) { linha[c] = null; continue; }
    if (c === "accuracy_meters") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { ok: false, erro: "accuracy_meters invalido" };
    } else if (CAMPOS_UUID.has(c)) {
      if (!eUuid(v)) return { ok: false, erro: `${c} invalido` };
    } else if (typeof v !== "string" || v.length > MAX_TEXTO) {
      return { ok: false, erro: `${c} invalido` };
    }
    linha[c] = v;
  }
  return { ok: true, linha };
}

function posicao(p: Record<string, unknown>): { ok: true; lat: number; lng: number } | { ok: false; erro: string } | null {
  if (!presente(p.latitude) && !presente(p.longitude)) return null;
  const lat = p.latitude, lng = p.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, erro: "latitude e longitude invalidas" };
  }
  return { ok: true, lat, lng };
}

/** O ponto no formato que o PostGIS aceita (refeito aqui, nunca copiado do pedido). */
export function pontoPostgis(lat: number, lng: number) {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * create_address: morada nova, sempre "PROPOSED" (por validar), criada em nome de quem pede.
 * Recusa pedidos que tragam outro estado ou campos da validação.
 */
export function limparMoradaNova(payload: unknown, quemPede: string): Limpeza {
  const p = objeto(payload);
  if (!p) return { ok: false, erro: "payload invalido" };
  if (presente(p.status) && p.status !== ESTADO_INICIAL) return { ok: false, erro: "uma morada nova fica sempre por validar (PROPOSED)" };
  const pos = posicao(p);
  if (!pos) return { ok: false, erro: "latitude e longitude sao obrigatorias" };
  if (!pos.ok) return pos;
  const campos = camposPermitidos(p);
  if (!campos.ok) return campos;
  return {
    ok: true,
    linha: {
      ...campos.linha,
      latitude: pos.lat,
      longitude: pos.lng,
      location: pontoPostgis(pos.lat, pos.lng),
      status: ESTADO_INICIAL,
      source: "app",
      created_by: quemPede,
    },
  };
}

/**
 * update_address: só os campos permitidos (nunca o estado nem a validação).
 * O id e o based_on_updated_at vêm à parte.
 */
export function limparEdicaoMorada(payload: unknown): Limpeza {
  const p = objeto(payload);
  if (!p) return { ok: false, erro: "payload invalido" };
  if (presente(p.status)) return { ok: false, erro: "o estado da morada so muda na validacao" };
  const campos = camposPermitidos(p);
  if (!campos.ok) return campos;
  const pos = posicao(p);
  if (pos && !pos.ok) return pos;
  const linha = { ...campos.linha };
  if (pos) Object.assign(linha, { latitude: pos.lat, longitude: pos.lng, location: pontoPostgis(pos.lat, pos.lng) });
  if (Object.keys(linha).length === 0) return { ok: false, erro: "nada para mudar" };
  return { ok: true, linha };
}

/** create_favorite: só a morada, a categoria e o nome; sempre de quem pede. */
export function limparFavorito(payload: unknown, quemPede: string): Limpeza {
  const p = objeto(payload);
  if (!p) return { ok: false, erro: "payload invalido" };
  if (!eUuid(p.address_id)) return { ok: false, erro: "address_id invalido" };
  const linha: Record<string, unknown> = { address_id: p.address_id, user_id: quemPede };
  for (const c of ["category", "label"]) {
    const v = p[c];
    if (v === undefined) continue;
    if (v !== null && (typeof v !== "string" || v.length > 100)) return { ok: false, erro: `${c} invalido` };
    linha[c] = v;
  }
  return { ok: true, linha };
}

/** Atualização segura: só o dono pode alterar nome/categoria. */
export function limparEdicaoFavorito(payload: unknown): Limpeza {
  const p = objeto(payload);
  if (!p || !eUuid(p.id)) return { ok: false, erro: "id do favorito invalido" };
  const linha: Record<string, unknown> = {};
  if (p.category !== undefined) {
    if (typeof p.category !== "string" || p.category.length > 100) return { ok: false, erro: "category invalido" };
    linha.category = p.category;
  }
  if (p.label !== undefined) {
    if (p.label !== null && (typeof p.label !== "string" || p.label.length > 100)) return { ok: false, erro: "label invalido" };
    linha.label = p.label;
  }
  if (Object.keys(linha).length === 0) return { ok: false, erro: "nada para mudar" };
  return { ok: true, linha };
}

export function limparRemocaoFavorito(payload: unknown): Limpeza {
  const p = objeto(payload);
  if (!p || !eUuid(p.id)) return { ok: false, erro: "id do favorito invalido" };
  return { ok: true, linha: { id: p.id } };
}

/** Quem pode editar uma morada pela sync: quem a criou enquanto está por validar, ou um administrador. */
export function podeEditarMorada(atual: { created_by: string | null; status: string }, quemPede: string, eAdmin: boolean) {
  return eAdmin || (atual.created_by === quemPede && atual.status === ESTADO_INICIAL);
}

/** Operações que a sync reencaminha para outras funções (com a sessão de quem pede). */
export const REENCAMINHADAS: Record<string, string> = {
  create_delivery: "deliveries?action=create",
  field_submit: "field-service?action=submit",
  delivery_proof: "deliveries?action=update_status",
};
