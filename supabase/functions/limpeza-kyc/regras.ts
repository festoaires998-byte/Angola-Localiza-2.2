// Regras puras da limpeza das fotos da verificação simples (testadas em
// src/__tests__/limpezaKyc.test.ts).

export const BUCKET = "kyc-artifacts";

/** Dias depois da decisão (aprovar ou recusar) em que as fotos são apagadas. */
export const DIAS_RETENCAO = 90;

/** Pedidos tratados por chamada (a próxima chamada continua). */
export const LOTE = 100;

/** Estados com decisão tomada. "Por rever" nunca é apagado. */
export const ESTADOS_DECIDIDOS = ["VERIFIED", "REJECTED"];

/** A partir de quando (ISO) uma decisão já tem mais de 90 dias. */
export function limiteRetencao(agora: Date): string {
  return new Date(agora.getTime() - DIAS_RETENCAO * 24 * 3600 * 1000).toISOString();
}

/**
 * Nome do ficheiro dentro do bucket, a partir do que está guardado:
 * "<id>/x.jpg", "kyc-artifacts/<id>/x.jpg" ou um URL do Storage.
 * null se não for um nome seguro (vazio, com "..", ou de outro bucket).
 */
export function nomeNoBucket(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  let nome = valor.trim();
  const url = nome.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
  if (url) {
    if (url[1] !== BUCKET) return null;
    nome = decodeURIComponent(url[2]);
  } else if (/^https?:\/\//i.test(nome)) {
    return null;
  }
  if (nome.startsWith(`${BUCKET}/`)) nome = nome.slice(BUCKET.length + 1);
  if (!nome || nome.split("/").some((p) => p === ".." || p === "")) return null;
  return nome;
}

/** Os nomes (sem repetidos) a apagar de um pedido de verificação. */
export function nomesDoPedido(linha: {
  citizen_id_photo_front_url?: unknown;
  citizen_id_photo_back_url?: unknown;
  citizen_selfie_url?: unknown;
}): string[] {
  const nomes = [linha.citizen_id_photo_front_url, linha.citizen_id_photo_back_url, linha.citizen_selfie_url]
    .map(nomeNoBucket)
    .filter((n): n is string => n !== null);
  return [...new Set(nomes)];
}
