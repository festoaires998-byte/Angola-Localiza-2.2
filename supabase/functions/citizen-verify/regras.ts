// Angola Localiza - Citizen Verify: regras puras (sem Deno, sem base de dados).
// Usadas pela Edge Function (index.ts) E pelos testes da app. Não importar nada aqui.

export const BUCKET = "kyc-artifacts";
export const ESTADOS = ["PENDING_REVIEW", "VERIFIED", "REJECTED"] as const;
export type EstadoCidadao = (typeof ESTADOS)[number];

export interface PedidoVerificacao {
  id_photo_front_url: string;
  id_photo_back_url: string;
  selfie_url: string;
}

/** Nome de um ficheiro na raiz do bucket (sem "/", sem ".."), como a app e o site o enviam. */
const NOME_VALIDO = /^[A-Za-z0-9._-]{5,200}$/;

/** Valida o pedido de submit: 3 nomes de ficheiros diferentes, válidos. */
export function validarPedido(body: unknown): { ok: true; pedido: PedidoVerificacao; nomes: string[] } | { ok: false; erro: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const nomes = [b.id_photo_front_url, b.id_photo_back_url, b.selfie_url];
  if (nomes.some((n) => typeof n !== "string" || !n.trim())) {
    return { ok: false, erro: "foto da frente, do verso e a selfie sao todas obrigatorias" };
  }
  const limpos = (nomes as string[]).map((n) => n.trim());
  if (limpos.some((n) => !NOME_VALIDO.test(n) || n.includes(".."))) {
    return { ok: false, erro: "nome de ficheiro invalido" };
  }
  if (new Set(limpos).size !== 3) return { ok: false, erro: "as 3 fotos tem de ser ficheiros diferentes" };
  return { ok: true, pedido: { id_photo_front_url: limpos[0], id_photo_back_url: limpos[1], selfie_url: limpos[2] }, nomes: limpos };
}

/** O que o cidadão vê (status): a coluna antiga citizen_id_verified e o estado novo. */
export function estadoPublico(linha: { citizen_id_verified?: boolean | null; citizen_id_status?: string | null; citizen_id_rejection_reason?: string | null } | null) {
  const verificado = linha?.citizen_id_verified === true;
  const estado = (ESTADOS as readonly string[]).includes(linha?.citizen_id_status ?? "")
    ? (linha!.citizen_id_status as EstadoCidadao)
    : verificado ? "VERIFIED" : null;
  return {
    citizen_id_verified: verificado,
    citizen_id_status: estado,
    rejection_reason: estado === "REJECTED" ? linha?.citizen_id_rejection_reason ?? null : null,
  };
}

/** Valida a decisão de um administrador (review). */
export function validarRevisao(body: unknown): { ok: true; userId: string; aprovar: boolean; motivo: string | null } | { ok: false; erro: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.user_id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.user_id)) return { ok: false, erro: "user_id invalido" };
  if (b.decision !== "approve" && b.decision !== "reject") return { ok: false, erro: "decision tem de ser approve ou reject" };
  const motivo = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 300) : null;
  if (b.decision === "reject" && !motivo) return { ok: false, erro: "para recusar e preciso um motivo (o cidadao ve-o)" };
  return { ok: true, userId: b.user_id, aprovar: b.decision === "approve", motivo };
}

/** Contexto do cidadão para o administrador (email, nome e telefone, se existirem). */
export interface ContactoCidadao {
  email: string | null;
  name: string | null;
  phone: string | null;
}

const textoOuNull = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Junta o que se sabe do cidadão: o email e o nome vêm da conta (auth.users,
 * lida pela Edge Function com a service role) e o telefone de user_identity.
 */
export function contactoDoCidadao(
  utilizador: { email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> | null } | null,
  telefoneIdentidade: string | null | undefined,
): ContactoCidadao {
  const meta = utilizador?.user_metadata ?? {};
  return {
    email: textoOuNull(utilizador?.email, 254),
    name: textoOuNull(meta.full_name) ?? textoOuNull(meta.name) ?? textoOuNull(meta.nome),
    phone: textoOuNull(telefoneIdentidade, 30) ?? textoOuNull(utilizador?.phone, 30),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida o pedido de "view" (abrir as fotos de um cidadão). */
export function validarAbertura(body: unknown): { ok: true; userId: string } | { ok: false; erro: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.user_id !== "string" || !UUID.test(b.user_id)) return { ok: false, erro: "user_id invalido" };
  return { ok: true, userId: b.user_id };
}

/** Ninguém revê (nem abre as fotos de) a própria verificação, mesmo sendo administrador. */
export function eRevisaoPropria(quemRevê: string, cidadao: string): boolean {
  return quemRevê.toLowerCase() === cidadao.toLowerCase();
}
