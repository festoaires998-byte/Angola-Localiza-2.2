// Regras puras da função signing-keys (testadas em src/__tests__/signingKeys.test.ts).

/** Chave pública ECDSA P-256 em JWK, só com os campos públicos. */
export interface JwkPublica {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

/**
 * Devolve a chave pública limpa (só kty, crv, x, y) ou null se não for uma
 * chave pública P-256 válida. Recusa chaves privadas (campo "d").
 */
export function jwkPublicaValida(valor: unknown): JwkPublica | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const j = valor as Record<string, unknown>;
  if ("d" in j) return null;
  if (j.kty !== "EC" || j.crv !== "P-256") return null;
  if (typeof j.x !== "string" || typeof j.y !== "string") return null;
  if (!BASE64URL_32_BYTES.test(j.x) || !BASE64URL_32_BYTES.test(j.y)) return null;
  return { kty: "EC", crv: "P-256", x: j.x, y: j.y };
}

/** As duas chaves são a mesma (mesmo x e y)? */
export function mesmaChave(a: unknown, b: unknown): boolean {
  const ca = jwkPublicaValida(a);
  const cb = jwkPublicaValida(b);
  return !!ca && !!cb && ca.x === cb.x && ca.y === cb.y;
}

/** O device_id que a app gera: "app-" + UUID (o site antigo usa outros formatos). */
export function deviceIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= 200;
}

export type DecisaoRegisto =
  | { tipo: "igual" }
  | { tipo: "nova" }
  | { tipo: "troca" }
  | { tipo: "revogada" };

/**
 * O que fazer com um pedido de registo, dado o que já existe para este
 * utilizador e aparelho:
 * - igual: a mesma chave já está registada (nada a gravar);
 * - nova: primeira chave deste aparelho;
 * - troca: o aparelho já tinha outra chave (fica registado em audit_logs);
 * - revogada: a chave deste aparelho foi revogada; o aparelho não pode
 *   registar outra sozinho (senão a revogação não servia de nada).
 */
export function decidirRegisto(
  existente: { public_key_jwk: unknown; revoked_at?: string | null } | null,
  nova: JwkPublica,
): DecisaoRegisto {
  if (!existente) return { tipo: "nova" };
  if (existente.revoked_at) return { tipo: "revogada" };
  return mesmaChave(existente.public_key_jwk, nova) ? { tipo: "igual" } : { tipo: "troca" };
}
