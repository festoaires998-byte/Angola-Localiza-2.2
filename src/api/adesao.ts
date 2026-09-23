import type { CofreChaves } from '@/services/cofre/armazenamentoSessao';

/** Nome, no expo-secure-store, do token do link de adesão à espera do login. */
export const NOME_TOKEN_ADESAO = 'angola_localiza.adesao_pendente';

export interface CofreAdesao extends CofreChaves {
  deleteItemAsync(nome: string): Promise<void>;
}

/** Resposta de POST /functions/v1/join-link?action=consume quando corre bem. */
export interface ResultadoAdesao {
  ok: true;
  role: string;
  requires_mfa?: boolean;
}

/** Erro com o código HTTP (0 = sem rede), como o ErroFuncao. */
interface ErroComEstado {
  estado: number;
  message: string;
}

function eDefinitivo(erro: unknown): boolean {
  const estado = (erro as Partial<ErroComEstado> | null)?.estado;
  // 404 (não existe), 410 (revogado, expirado, esgotado), 400/403/422: não adianta repetir.
  // 401 (sem sessão), 408, 429, 5xx e falta de rede: tentar no próximo login.
  return typeof estado === 'number' && estado >= 400 && estado < 500 && ![401, 408, 429].includes(estado);
}

export type ResultadoConsumo =
  | { estado: 'sem_token' }
  | { estado: 'aderiu'; cargo: string }
  | { estado: 'link_invalido'; mensagem: string }
  | { estado: 'tentar_mais_tarde'; mensagem: string };

/**
 * Regras do link de adesão, com o cofre e a chamada ao servidor por parâmetro.
 * - guardar(token): guarda até haver sessão;
 * - consumir(): envia o token; apaga-o se correu bem ou se o servidor diz
 *   que o link não serve; guarda-o se falhou por rede/sessão/servidor.
 */
export function criarAdesao(
  cofre: CofreAdesao,
  consumirNoServidor: (token: string) => Promise<ResultadoAdesao>,
) {
  return {
    async guardar(token: string): Promise<void> {
      const limpo = token.trim();
      if (!limpo) throw new Error('O link de adesão não tem token.');
      await cofre.setItemAsync(NOME_TOKEN_ADESAO, limpo);
    },

    async consumir(): Promise<ResultadoConsumo> {
      const token = await cofre.getItemAsync(NOME_TOKEN_ADESAO);
      if (!token) return { estado: 'sem_token' };
      try {
        const r = await consumirNoServidor(token);
        await cofre.deleteItemAsync(NOME_TOKEN_ADESAO);
        return { estado: 'aderiu', cargo: r.role };
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        if (eDefinitivo(erro)) {
          await cofre.deleteItemAsync(NOME_TOKEN_ADESAO);
          return { estado: 'link_invalido', mensagem };
        }
        return { estado: 'tentar_mais_tarde', mensagem };
      }
    },
  };
}
