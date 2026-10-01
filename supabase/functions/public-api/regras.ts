// Regras puras da public-api (testadas em src/__tests__/publicApi.test.ts).

/** Só moradas validadas aparecem às organizações. */
export const STATUS_PERMITIDOS = ["PUBLISHED", "APPROVED", "OFFICIAL"];

/**
 * A morada pode ser mostrada a uma organização (chave da API)? Só validada
 * e nunca "Privada" (as privadas só as vê quem as criou, como na app e no site).
 */
export function moradaPublica(a: { status?: string | null; visibility_level?: string | null } | null | undefined): boolean {
  return !!a && STATUS_PERMITIDOS.includes(a.status ?? "") && a.visibility_level !== "PRIVATE";
}

/** Texto para ilike tal e qual: os %, _ e \ escritos não são curingas. */
export function escaparIlike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** A organização da chave pode ver esta entrega? Só as que ela própria paga. */
export function entregaDaOrganizacao(entrega: { payer_organization_id?: string | null }, organizacaoDaChave: string | null): boolean {
  return !!organizacaoDaChave && entrega.payer_organization_id === organizacaoDaChave;
}
