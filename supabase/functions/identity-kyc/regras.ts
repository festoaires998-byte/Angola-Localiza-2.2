// Regras puras da verificação de identidade do pessoal (testadas em src/__tests__/identityKyc.test.ts).

/**
 * Nome do ficheiro no bucket privado kyc-artifacts, só se estiver na pasta de
 * quem envia ("<id>/…"). Aceita o caminho simples ou com o prefixo do bucket.
 */
export function nomeNaPastaKyc(valor: unknown, quemEnvia: string): string | null {
  if (typeof valor !== "string") return null;
  const nome = valor.trim().replace(/^kyc-artifacts\//, "");
  if (nome.includes("..") || nome.length > 300) return null;
  if (!/^[0-9a-fA-F-]{36}\/[A-Za-z0-9._\/-]{1,200}$/.test(nome)) return null;
  return nome.slice(0, 36).toLowerCase() === quemEnvia.toLowerCase() ? nome : null;
}
