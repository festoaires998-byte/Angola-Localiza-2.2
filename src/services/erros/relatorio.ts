import type { ErroPendente, RepositorioErrosPendentes } from '@/database/repositories/errosPendentes';

/**
 * Relatório de erros leve: a app guarda os erros no telemóvel e envia-os em
 * pequenos lotes para a tabela app_errors quando há rede e sessão.
 * Para gastar poucos dados: textos curtos, no máximo 50 guardados, o mesmo
 * erro só uma vez por hora, e 20 por envio.
 */

export const MAX_MENSAGEM = 500;
export const MAX_PILHA = 4000;
export const MAX_GUARDADOS = 50;
export const POR_ENVIO = 20;
const UMA_HORA = 3600 * 1000;

/** O que vai para o servidor (colunas de public.app_errors). */
export interface LinhaErroServidor {
  message: string;
  stack: string | null;
  fatal: boolean;
  screen: string | null;
  occurred_at: string;
  app_version: string | null;
  platform: string | null;
  device_id: string | null;
}

export interface DependenciasRelatorio {
  erros: Pick<RepositorioErrosPendentes, 'guardar' | 'listar' | 'apagar' | 'limitar'>;
  /** Grava as linhas no servidor; lança erro se não conseguir. */
  enviar(linhas: LinhaErroServidor[]): Promise<void>;
  gerarId(): string;
  agora?: () => Date;
  info: () => Promise<{ versao: string | null; plataforma: string | null; deviceId: string | null }>;
}

/** Texto curto e sem quebras de linha a mais. */
export function encurtar(texto: string, maximo: number): string {
  const t = texto.replace(/\s+\n/g, '\n').trim();
  return t.length > maximo ? `${t.slice(0, maximo - 1)}…` : t;
}

/** Mensagem e pilha de qualquer coisa lançada. */
export function descreverErro(erro: unknown): { mensagem: string; pilha: string | null } {
  if (erro instanceof Error) {
    const nome = erro.name && erro.name !== 'Error' ? `${erro.name}: ` : '';
    return {
      mensagem: encurtar(`${nome}${erro.message || 'Erro sem mensagem'}`, MAX_MENSAGEM),
      pilha: erro.stack ? encurtar(erro.stack, MAX_PILHA) : null,
    };
  }
  let texto: string;
  try {
    texto = typeof erro === 'string' ? erro : JSON.stringify(erro);
  } catch {
    texto = String(erro);
  }
  return { mensagem: encurtar(texto || 'Erro desconhecido', MAX_MENSAGEM), pilha: null };
}

export function criarRelatorioErros(deps: DependenciasRelatorio) {
  const agora = () => deps.agora?.() ?? new Date();
  let aEnviar: Promise<number> | null = null;

  return {
    /** Guarda o erro no telemóvel. Nunca lança (um erro ao guardar não pode piorar o outro). */
    async registar(erro: unknown, opcoes: { fatal?: boolean; ecra?: string | null } = {}): Promise<void> {
      try {
        const { mensagem, pilha } = descreverErro(erro);
        const quando = agora();
        const recentes = await deps.erros.listar(MAX_GUARDADOS);
        const repetido = recentes.some(
          (e) => e.mensagem === mensagem && quando.getTime() - new Date(e.ocorreu_em).getTime() < UMA_HORA,
        );
        if (repetido) return;
        await deps.erros.guardar({
          id: deps.gerarId(),
          mensagem,
          pilha,
          fatal: opcoes.fatal === true,
          ecra: opcoes.ecra ? encurtar(opcoes.ecra, 200) : null,
          ocorreu_em: quando.toISOString(),
        });
        await deps.erros.limitar(MAX_GUARDADOS);
      } catch {
        // Sem base de dados não há onde guardar: o erro perde-se.
      }
    },

    /**
     * Envia os guardados (em lotes de 20) e apaga os que foram aceites.
     * Devolve quantos foram enviados. Um envio de cada vez.
     */
    enviarPendentes(): Promise<number> {
      if (aEnviar) return aEnviar;
      aEnviar = (async () => {
        let enviados = 0;
        try {
          const { versao, plataforma, deviceId } = await deps.info();
          for (let volta = 0; volta < Math.ceil(MAX_GUARDADOS / POR_ENVIO); volta++) {
            const lote: ErroPendente[] = await deps.erros.listar(POR_ENVIO);
            if (lote.length === 0) break;
            await deps.enviar(
              lote.map((e) => ({
                message: e.mensagem,
                stack: e.pilha,
                fatal: e.fatal,
                screen: e.ecra,
                occurred_at: e.ocorreu_em,
                app_version: versao,
                platform: plataforma,
                device_id: deviceId,
              })),
            );
            await deps.erros.apagar(lote.map((e) => e.id));
            enviados += lote.length;
          }
        } catch {
          // Sem rede, sem sessão ou limite do servidor: fica para a próxima.
        }
        return enviados;
      })().finally(() => {
        aEnviar = null;
      });
      return aEnviar;
    },
  };
}

export type RelatorioErros = ReturnType<typeof criarRelatorioErros>;
