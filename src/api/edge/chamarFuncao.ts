import { obterConfigSupabase } from '@/config/env';

import { supabase } from '../supabase';

/** Erro devolvido por uma Edge Function (ou falta de rede). */
export class ErroFuncao extends Error {
  /** Código HTTP; 0 quando o pedido nem chegou ao servidor. */
  readonly estado: number;
  constructor(mensagem: string, estado: number) {
    super(mensagem);
    this.name = 'ErroFuncao';
    this.estado = estado;
  }
  /** Verdadeiro para erros que não se resolvem a tentar outra vez (4xx menos 401/408/429). */
  get definitivo(): boolean {
    return this.estado >= 400 && this.estado < 500 && ![401, 408, 429].includes(this.estado);
  }
}

export interface OpcoesChamada {
  body?: unknown;
  /** Tempo máximo em milissegundos (por omissão 20 s). */
  tempoMaximo?: number;
}

/**
 * POST /functions/v1/<nome>?action=<acao> com o token da sessão atual.
 * Devolve o JSON da resposta; lança ErroFuncao se falhar.
 */
export async function chamarFuncao<T = unknown>(
  nome: string,
  acao: string,
  opcoes: OpcoesChamada = {},
): Promise<T> {
  const { url, chaveAnon } = obterConfigSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroFuncao('Sem sessão iniciada.', 401);

  const controlo = new AbortController();
  const temporizador = setTimeout(() => controlo.abort(), opcoes.tempoMaximo ?? 20_000);
  let resposta: Response;
  try {
    resposta = await fetch(
      `${url}/functions/v1/${encodeURIComponent(nome)}?action=${encodeURIComponent(acao)}`,
      {
        method: 'POST',
        headers: {
          apikey: chaveAnon,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(opcoes.body ?? {}),
        signal: controlo.signal,
      },
    );
  } catch {
    throw new ErroFuncao('Sem ligação ao servidor.', 0);
  } finally {
    clearTimeout(temporizador);
  }

  const texto = await resposta.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (!resposta.ok) {
    const erro = (corpo as { error?: unknown } | null)?.error;
    throw new ErroFuncao(
      typeof erro === 'string' && erro ? erro : `Erro ${resposta.status} em ${nome}.`,
      resposta.status,
    );
  }
  return corpo as T;
}
