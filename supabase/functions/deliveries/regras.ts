// Angola Localiza - Deliveries: regras puras (sem Deno, sem base de dados).
// Usadas pela Edge Function (index.ts) E pelos testes da app. Não importar nada aqui.

export const TRANSITIONS: Record<string, string[]> = {
  CREATED: ["ASSIGNED", "CANCELLED"], ASSIGNED: ["PICKED_UP", "CANCELLED"], PICKED_UP: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "CANCELLED"], OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"], FAILED: ["ASSIGNED", "CANCELLED"],
  DELIVERED: [], CANCELLED: [],
};
export const FAILURE_REASONS = ["morada_nao_encontrada", "destinatario_ausente", "codigo_incorreto", "recusa", "outro"];

/** Bucket privado das provas (app, desde a v19): "<id de quem envia>/<ficheiro>". */
export const BUCKET_PROVAS = "delivery-proofs";
/** Bucket público onde o site antigo ainda guarda as provas (transição, até ao hotfix). */
export const BUCKET_LEGADO = "field-photos";

/** Tentativas de PIN erradas até a entrega ficar bloqueada (o remetente gera um PIN novo). */
export const MAX_TENTATIVAS_PIN = 5;
/** Validade de um PIN novo. */
export const VALIDADE_PIN_HORAS = 72;
/** Folga para o relógio do telemóvel: uma prova assinada "no futuro" além disto não confere. */
export const FOLGA_RELOGIO_MS = 10 * 60 * 1000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NOME = "[A-Za-z0-9._-]{5,200}";

export interface FicheiroProva {
  bucket: string;
  /** Nome no bucket (com a pasta, se houver). */
  nome: string;
}

/**
 * Onde está o ficheiro de uma prova (foto ou assinatura desenhada):
 * - app: "delivery-proofs/<uuid>/<ficheiro>", ou o URL do Storage para esse caminho;
 * - site antigo: o URL público "…/storage/v1/object/public/field-photos/<ficheiro>".
 * Qualquer outro valor (outro site, "..", outra pasta) dá null.
 */
export function ficheiroDaProva(valor: unknown, supabaseUrl: string): FicheiroProva | null {
  if (typeof valor !== "string") return null;
  let resto = valor.trim();
  const base = supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/";
  if (resto.startsWith(base)) {
    resto = resto.slice(base.length).replace(/^(?:public|authenticated)\//, "");
  } else if (/^[a-z]+:/i.test(resto)) {
    return null;
  }
  if (resto.includes("..")) return null;
  const app = resto.match(new RegExp(`^${BUCKET_PROVAS}/(${UUID}/${NOME})$`, "i"));
  if (app) return { bucket: BUCKET_PROVAS, nome: app[1] };
  const site = resto.match(new RegExp(`^${BUCKET_LEGADO}/(${NOME})$`));
  if (site) return { bucket: BUCKET_LEGADO, nome: site[1] };
  return null;
}

/** Texto guardado em delivery_proofs.photo_url / signature_url. */
export function textoDoFicheiro(f: FicheiroProva, supabaseUrl: string): string {
  return f.bucket === BUCKET_PROVAS
    ? `${BUCKET_PROVAS}/${f.nome}`
    : `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET_LEGADO}/${f.nome}`;
}

export type ValidacaoProva =
  | { ok: true; foto: FicheiroProva | null; assinatura: FicheiroProva | null }
  | { ok: false; status: number; erro: string };

/**
 * Ficheiros da prova para o novo estado:
 * - DELIVERED: foto E assinatura desenhada obrigatórias (o PIN é validado à parte);
 * - PICKED_UP: foto obrigatória;
 * - FAILED: foto opcional.
 * Os ficheiros da app têm de estar na pasta de quem envia a prova.
 */
export function validarFicheirosProva(novoEstado: string, proof: unknown, quemEnvia: string, supabaseUrl: string): ValidacaoProva {
  const p = (proof ?? {}) as Record<string, unknown>;
  const temFoto = typeof p.photo_url === "string" && p.photo_url.trim() !== "";
  const temAssinatura = typeof p.signature_url === "string" && p.signature_url.trim() !== "";

  if (novoEstado === "PICKED_UP" && !temFoto) return { ok: false, status: 422, erro: "e obrigatoria uma foto como prova de recolha" };
  if (novoEstado === "DELIVERED") {
    if (!temFoto) return { ok: false, status: 422, erro: "POD_INCOMPLETA: falta a foto da entrega" };
    if (!temAssinatura) return { ok: false, status: 422, erro: "POD_INCOMPLETA: falta a assinatura de quem recebe" };
  }

  const foto = temFoto ? ficheiroDaProva(p.photo_url, supabaseUrl) : null;
  const assinatura = temAssinatura ? ficheiroDaProva(p.signature_url, supabaseUrl) : null;
  if ((temFoto && !foto) || (temAssinatura && !assinatura)) {
    return { ok: false, status: 422, erro: "ficheiro da prova invalido (usa o bucket delivery-proofs)" };
  }
  for (const f of [foto, assinatura]) {
    if (f && f.bucket === BUCKET_PROVAS && f.nome.slice(0, f.nome.indexOf("/")).toLowerCase() !== quemEnvia.toLowerCase()) {
      return { ok: false, status: 403, erro: "os ficheiros da prova tem de estar na tua pasta" };
    }
  }
  if (foto && assinatura && foto.bucket === assinatura.bucket && foto.nome === assinatura.nome) {
    return { ok: false, status: 422, erro: "a foto e a assinatura tem de ser ficheiros diferentes" };
  }
  return { ok: true, foto, assinatura };
}

/**
 * PIN de 4 dígitos (1000–9999) com um sorteio forte, sem viés:
 * `aleatorio(n)` tem de devolver n bytes criptográficos (crypto.getRandomValues).
 */
export function gerarPin(aleatorio: (n: number) => Uint8Array): string {
  const limite = 65536 - (65536 % 9000);
  for (;;) {
    const b = aleatorio(2);
    const v = b[0] * 256 + b[1];
    if (v < limite) return String(1000 + (v % 9000));
  }
}

/** Resposta da função SQL verificar_pin_entrega. */
export interface ResultadoPin {
  resultado: "OK" | "WRONG" | "LOCKED" | "EXPIRED" | "NOT_FOUND";
  restantes?: number;
}

/** O que a função responde a um PIN que não passou (null se passou). */
export function respostaPin(r: ResultadoPin | null): { status: number; erro: string } | null {
  switch (r?.resultado) {
    case "OK":
      return null;
    case "EXPIRED":
      return { status: 410, erro: "PIN_EXPIRED: o PIN desta entrega expirou (72h) - pede ao remetente para gerar um novo" };
    case "LOCKED":
      return { status: 423, erro: `PIN_LOCKED: demasiadas tentativas erradas (${MAX_TENTATIVAS_PIN}) - pede ao remetente para gerar um novo PIN` };
    case "WRONG":
      return { status: 400, erro: `PIN de confirmacao incorreto (restam ${r.restantes ?? 0} tentativas)` };
    case "NOT_FOUND":
      return { status: 404, erro: "entrega nao encontrada" };
    default:
      return { status: 500, erro: "nao foi possivel validar o PIN" };
  }
}

/** O que a prova diz, para comparar com a mensagem assinada. */
export interface ContextoProva {
  deliveryId: string;
  latitude: number | null;
  longitude: number | null;
  /** SHA-256 (hex) dos ficheiros enviados; null se a prova não tem esse ficheiro. */
  fotoSha256: string | null;
  assinaturaSha256: string | null;
  agora: Date;
}

/**
 * A mensagem assinada diz o mesmo que a prova? (A assinatura em si é verificada à parte.)
 * - versão 1 (site): delivery_id, lat, lng, timestamp;
 * - versão 2 (app): também plus_code e o SHA-256 da foto e da assinatura desenhada.
 * Devolve o motivo da primeira diferença, ou null se tudo bate certo.
 */
export function diferencaNaMensagem(payloadTexto: string, c: ContextoProva): string | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(payloadTexto);
  } catch {
    return "mensagem assinada ilegivel";
  }
  if (!m || typeof m !== "object") return "mensagem assinada ilegivel";
  if (m.delivery_id !== c.deliveryId) return "assinada para outra entrega";

  const t = typeof m.timestamp === "string" ? Date.parse(m.timestamp) : NaN;
  if (!Number.isFinite(t)) return "mensagem sem data";
  if (t > c.agora.getTime() + FOLGA_RELOGIO_MS) return "data da assinatura no futuro";

  const temLocal = typeof m.lat === "number" && typeof m.lng === "number";
  if (c.latitude !== null && c.longitude !== null) {
    if (!temLocal || m.lat !== c.latitude || m.lng !== c.longitude) return "local diferente do assinado";
  } else if (temLocal) {
    return "local assinado mas nao enviado na prova";
  }

  if (m.versao === undefined) return null; // versão 1 (site): não tem os ficheiros
  if (m.versao !== 2) return "versao da mensagem desconhecida";
  const hash = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
  if (hash(m.foto_sha256) !== c.fotoSha256) return "foto diferente da assinada";
  if (hash(m.assinatura_manuscrita_sha256) !== c.assinaturaSha256) return "assinatura desenhada diferente da assinada";
  return null;
}

/** Contacto angolano: vazio, ou 9 dígitos (com ou sem +244). */
export function contactoValido(telefone: unknown): boolean {
  if (!telefone) return true;
  if (typeof telefone !== "string") return false;
  const digitos = telefone.replace(/\D/g, "");
  const local = digitos.startsWith("244") ? digitos.slice(3) : digitos;
  return local.length === 0 || local.length === 9;
}
