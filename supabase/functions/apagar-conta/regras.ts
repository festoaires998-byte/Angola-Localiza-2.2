// Regras puras da função apagar-conta (testadas em src/__tests__/apagarConta.test.ts).

/** Pastas privadas com ficheiros pessoais (<id>/...) apagadas com a conta. */
export const BUCKETS_PESSOAIS = ["kyc-artifacts", "chat-media"];

/** A pessoa tem de escrever esta palavra para confirmar. */
export const PALAVRA_CONFIRMACAO = "APAGAR";

export function confirmacaoValida(valor: unknown): boolean {
  return typeof valor === "string" && valor.trim().toUpperCase() === PALAVRA_CONFIRMACAO;
}

/** Caminhos completos dos ficheiros de uma listagem da pasta <id>/ (só ficheiros, sem subpastas). */
export function caminhosDaPasta(userId: string, lista: { name?: unknown; id?: unknown }[] | null | undefined): string[] {
  return (lista ?? [])
    .filter((f) => typeof f.name === "string" && f.name !== "" && f.id != null)
    .map((f) => `${userId}/${f.name as string}`);
}
