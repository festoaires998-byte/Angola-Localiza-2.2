// Regras puras da candidatura de motorista (testadas em src/__tests__/driverKyc.test.ts).

export const PAISES = ["AO", "MZ", "CV", "GW", "ST"];

/** Fotos obrigatórias (no bucket privado kyc-artifacts, na pasta de quem se candidata). */
export const CAMPOS_FOTOS = ["id_document_path", "license_front_path", "license_back_path", "vehicle_document_path", "selfie_path"] as const;
export const CAMPOS_TEXTO = ["vehicle_type", "vehicle_plate", "license_number"] as const;

/** País da conta: o perfil do país, senão o escolhido no registo (user_metadata), senão Angola. */
export function paisDaConta(perfil: string | null | undefined, metadata: unknown): string {
  const doPerfil = typeof perfil === "string" ? perfil.toUpperCase() : "";
  if (PAISES.includes(doPerfil)) return doPerfil;
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).country_code : null;
  const doRegisto = typeof m === "string" ? m.toUpperCase() : "";
  return PAISES.includes(doRegisto) ? doRegisto : "AO";
}

export type Candidatura =
  | { ok: true; linha: Record<string, unknown> }
  | { ok: false; erro: string };

/** Valida e limpa o que o candidato envia. */
export function limparCandidatura(body: Record<string, unknown>, uid: string): Candidatura {
  for (const c of CAMPOS_TEXTO) {
    const v = body[c];
    if (typeof v !== "string" || !v.trim() || v.length > 60) return { ok: false, erro: "DADOS_KYC_INCOMPLETOS" };
  }
  for (const c of CAMPOS_FOTOS) {
    const v = body[c];
    if (typeof v !== "string" || !v.startsWith(uid + "/") || v.includes("..") || v.length > 300) {
      return { ok: false, erro: "FICHEIRO_KYC_FORA_DA_PASTA_DO_UTILIZADOR" };
    }
  }
  let validade: string | null = null;
  if (body.license_expiry != null && body.license_expiry !== "") {
    if (typeof body.license_expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.license_expiry)) return { ok: false, erro: "VALIDADE_DA_CARTA_INVALIDA" };
    validade = body.license_expiry;
  }
  let capacidade: number | null = null;
  if (body.vehicle_capacity_kg != null && body.vehicle_capacity_kg !== "") {
    const n = Number(body.vehicle_capacity_kg);
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) return { ok: false, erro: "CAPACIDADE_INVALIDA" };
    capacidade = n;
  }
  const linha: Record<string, unknown> = {
    vehicle_type: (body.vehicle_type as string).trim(),
    vehicle_plate: (body.vehicle_plate as string).trim().toUpperCase(),
    license_number: (body.license_number as string).trim(),
    license_expiry: validade,
    vehicle_capacity_kg: capacidade,
  };
  for (const c of CAMPOS_FOTOS) linha[c] = body[c];
  return { ok: true, linha };
}

/** Posição opcional ao ficar disponível. */
export function posicaoValida(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { latitude: lat, longitude: lng };
}
