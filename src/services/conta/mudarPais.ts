import { nomeDoPais } from '@/config/pais';

/**
 * Mudar o país da conta: grava no servidor (função SQL mudar_pais_da_conta),
 * renova a sessão (para o país novo vir na conta) e só depois muda o país
 * neste telemóvel. Precisa de rede.
 */

export interface DependenciasMudarPais {
  estaOnline(): Promise<boolean>;
  /** Lança erro se o servidor recusar. */
  pedirAoServidor(codigo: string): Promise<void>;
  atualizarSessao(): Promise<void>;
  aplicarNoTelemovel(codigo: string): Promise<void>;
}

export type ResultadoMudarPais = { ok: true; pais: string } | { ok: false; erro: string };

export const SEM_REDE_PAIS = 'Sem internet. Para mudar o país da conta precisas de rede.';

/** Mensagem simples para cada erro do servidor. */
export function mensagemErroMudarPais(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : typeof erro === 'object' && erro && 'message' in erro ? String((erro as { message: unknown }).message) : String(erro);
  if (texto.includes('MUDAR_PAIS_PESSOAL')) return 'Tens um cargo na plataforma: para mudar de país, pede a um administrador.';
  if (texto.includes('MUDAR_PAIS_MOTORISTA')) return 'És motorista (ou tens uma candidatura): para mudar de país, pede a um administrador.';
  if (texto.includes('MUDAR_PAIS_INVALIDO')) return 'Este país ainda não está disponível.';
  if (texto.includes('MUDAR_PAIS_SEM_SESSAO') || /JWT|sess(ã|a)o/i.test(texto)) return 'A tua sessão terminou. Entra outra vez e tenta de novo.';
  if (/Network|fetch|rede|ligação/i.test(texto)) return SEM_REDE_PAIS;
  return `Não foi possível mudar o país (${texto}). Tenta outra vez mais tarde.`;
}

export function criarMudarPais(deps: DependenciasMudarPais) {
  return async function mudarPais(codigo: string): Promise<ResultadoMudarPais> {
    const pais = codigo.trim().toUpperCase();
    if (!(await deps.estaOnline().catch(() => false))) return { ok: false, erro: SEM_REDE_PAIS };
    try {
      await deps.pedirAoServidor(pais);
    } catch (e) {
      return { ok: false, erro: mensagemErroMudarPais(e) };
    }
    // O servidor já gravou: se o resto falhar, a app acerta ao voltar a abrir.
    await deps.atualizarSessao().catch(() => undefined);
    await deps.aplicarNoTelemovel(pais).catch(() => undefined);
    return { ok: true, pais };
  };
}

/** Texto do aviso antes de mudar. */
export function avisoMudarPais(codigo: string): string {
  const nome = nomeDoPais(codigo);
  return `O mapa, as pesquisas e as moradas novas passam a ser de ${nome} (${nome} Localiza). As moradas que já guardaste não mudam.`;
}
