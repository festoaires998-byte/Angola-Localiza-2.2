/**
 * Nome completo da conta (as regras, sem React e sem rede).
 *
 * Fica nos metadados da conta do Supabase (`user_metadata.full_name`), o mesmo
 * campo que a citizen-verify mostra aos administradores.
 */

export const NOME_MIN = 5;
export const NOME_MAX = 80;

/** Letras (com acentos), espaços, hífen, apóstrofo e ponto. */
const PERMITIDOS = /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/;

/** Tira espaços a mais: "  Ana   Maria  Silva " → "Ana Maria Silva". */
export function normalizarNome(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** O que está mal no nome, ou null se está bem. Pede nome e apelido. */
export function erroNome(texto: string): string | null {
  const nome = normalizarNome(texto);
  if (!nome) return 'Escreve o teu nome completo.';
  if (!PERMITIDOS.test(nome)) return 'O nome só pode ter letras, espaços e hífen.';
  const palavras = nome.split(' ').filter((p) => /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(p));
  if (palavras.length < 2) return 'Escreve o nome e o apelido (ex.: Ana Silva).';
  if (nome.length < NOME_MIN) return 'O nome é demasiado curto.';
  if (nome.length > NOME_MAX) return `O nome é demasiado longo (máximo ${NOME_MAX} letras).`;
  return null;
}

/** Nome guardado na conta (user_metadata), ou null se não tem. */
export function nomeDaConta(metadados: Record<string, unknown> | null | undefined): string | null {
  const v = metadados?.full_name;
  return typeof v === 'string' && normalizarNome(v) ? normalizarNome(v) : null;
}
