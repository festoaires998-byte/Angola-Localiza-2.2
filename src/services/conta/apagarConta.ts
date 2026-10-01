/**
 * Apagar a conta: pede ao servidor (função apagar-conta), apaga os dados
 * deste utilizador no telemóvel e sai. Precisa de rede.
 */

export interface DependenciasApagarConta {
  /** POST apagar-conta?action=apagar; lança erro se o servidor recusar. */
  pedirAoServidor(confirmacao: string): Promise<void>;
  apagarDadosLocais(userId: string): Promise<void>;
  sair(): Promise<void>;
}

export type ResultadoApagar = { ok: true } | { ok: false; erro: string };

/** Mensagem simples para cada erro do servidor. */
export function mensagemErroApagar(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  if (texto.startsWith('SUPER_ADMIN')) {
    return 'És super administrador: pede a outro super administrador para te tirar o cargo antes de apagares a conta.';
  }
  if (texto.startsWith('CONFIRMACAO_EM_FALTA')) return 'Escreve APAGAR (em maiúsculas ou minúsculas) para confirmar.';
  if (/Sem ligação|Network|rede/i.test(texto)) return 'Sem ligação ao servidor. Para apagar a conta precisas de rede.';
  if (/sess(ã|a)o/i.test(texto)) return 'A tua sessão terminou. Entra outra vez e tenta de novo.';
  return `Não foi possível apagar a conta (${texto}). Tenta outra vez mais tarde.`;
}

export function criarApagarConta(deps: DependenciasApagarConta) {
  return async function apagarConta(userId: string, confirmacao: string): Promise<ResultadoApagar> {
    try {
      await deps.pedirAoServidor(confirmacao);
    } catch (e) {
      return { ok: false, erro: mensagemErroApagar(e) };
    }
    // A conta já foi apagada no servidor: o resto é arrumar o telemóvel.
    await deps.apagarDadosLocais(userId).catch(() => undefined);
    await deps.sair().catch(() => undefined);
    return { ok: true };
  };
}
