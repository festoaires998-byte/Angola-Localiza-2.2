import { gerarUuid, type GeradorId } from '../ids';
import type { BaseDados } from '../tipos';
import { marcadores, paraIso, paraJson, relogioDoSistema, type Relogio } from '../util';

/** Tipos de operação aceites pela Edge Function "sync". */
export const TIPOS_OPERACAO = [
  'create_address',
  'create_favorite',
  'update_favorite',
  'remove_favorite',
  'create_delivery',
  'field_submit',
  'delivery_proof',
] as const;
export type TipoOperacao = (typeof TIPOS_OPERACAO)[number];

export type EstadoFila = 'pendente' | 'a_enviar' | 'concluida' | 'falhou_definitivo';

/** Uma operação na fila, já com o payload convertido de JSON. */
export interface OperacaoFila {
  operation_id: string;
  device_id: string;
  /**
   * Utilizador que criou a operação. null nas operações criadas antes da
   * migração 002: essas nunca são enviadas automaticamente.
   */
  user_id: string | null;
  operation_type: TipoOperacao;
  payload: unknown;
  estado: EstadoFila;
  tentativas: number;
  ultimo_erro: string | null;
  proxima_tentativa_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Forma exata de cada operação no pedido POST /functions/v1/sync. */
export interface OperacaoParaSync {
  operation_id: string;
  device_id: string;
  operation_type: TipoOperacao;
  payload: unknown;
}

/** Um elemento de "results" na resposta da Edge Function "sync". */
export interface ResultadoSync {
  operation_id: string;
  status: string;
  error?: string;
  message?: string;
}

export interface OpcoesFilaSaida {
  /** device_id deste telemóvel (vai em cada operação). */
  deviceId: string;
  gerarId?: GeradorId;
  relogio?: Relogio;
  /**
   * Depois de quantas falhas a operação passa a "falhou_definitivo".
   * Por omissão nunca desiste, tal como o site faz hoje.
   */
  maxTentativas?: number;
}

interface LinhaFila extends Omit<OperacaoFila, 'payload'> {
  payload_json: string;
}

/** Espera antes de tentar de novo: 30 s, 1 min, 2 min, ... até 1 hora. */
/**
 * Erros do servidor que não se resolvem a tentar outra vez: a operação passa
 * logo a "falhou_definitivo" (e aparece ao utilizador), em vez de voltar à fila.
 * Importante no PIN: cada envio com o PIN errado gasta uma das 5 tentativas.
 */
const ERROS_SEM_VOLTA = [
  /PIN de confirmacao incorreto/,
  /^PIN_(LOCKED|EXPIRED)/,
  /^POD_INCOMPLETA/,
  /transicao invalida/,
  /ficheiro da prova invalido/,
  /tem de estar na tua pasta/,
  /nao existem ou nao foram enviados/,
  /^nao autorizado/,
  /^CITIZEN_ID_NOT_VERIFIED/,
  /^CONTACTO_INVALID/,
  /so muda na validacao/,
  /fica sempre por validar/,
  /pertence a outra pessoa/,
];

export function erroSemVolta(erro: string): boolean {
  return ERROS_SEM_VOLTA.some((r) => r.test(erro));
}

export function esperaAposFalha(tentativas: number): number {
  const segundos = 30 * 2 ** Math.max(0, tentativas - 1);
  return Math.min(segundos, 3600) * 1000;
}

function exigirUtilizador(userId: string): void {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('A operação da fila tem de ter o utilizador (user_id).');
  }
}

function deLinha(linha: LinhaFila): OperacaoFila {
  const { payload_json, ...resto } = linha;
  return { ...resto, payload: JSON.parse(payload_json) };
}

export function criarRepositorioFilaSaida(db: BaseDados, opcoes: OpcoesFilaSaida) {
  const gerarId = opcoes.gerarId ?? gerarUuid;
  const agora = opcoes.relogio ?? relogioDoSistema;
  const maxTentativas = opcoes.maxTentativas ?? Number.POSITIVE_INFINITY;

  return {
    /** Põe uma operação nova do utilizador `userId` na fila e devolve-a. */
    async adicionar(userId: string, tipo: TipoOperacao, payload: unknown, operationId?: string): Promise<OperacaoFila> {
      exigirUtilizador(userId);
      const operacao: OperacaoFila = {
        operation_id: operationId ?? gerarId(),
        device_id: opcoes.deviceId,
        user_id: userId,
        operation_type: tipo,
        payload,
        estado: 'pendente',
        tentativas: 0,
        ultimo_erro: null,
        proxima_tentativa_em: null,
        criado_em: paraIso(agora()),
        atualizado_em: paraIso(agora()),
      };
      await db.run(
        `INSERT INTO fila_saida (operation_id, device_id, user_id, operation_type, payload_json,
           estado, tentativas, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, 'pendente', 0, ?, ?)`,
        [
          operacao.operation_id,
          operacao.device_id,
          userId,
          tipo,
          paraJson(payload),
          operacao.criado_em,
          operacao.atualizado_em,
        ],
      );
      return operacao;
    },

    async obter(operationId: string): Promise<OperacaoFila | null> {
      const linha = await db.getFirst<LinhaFila>(
        'SELECT * FROM fila_saida WHERE operation_id = ?',
        [operationId],
      );
      return linha ? deLinha(linha) : null;
    },

    /**
     * Operações pendentes DO UTILIZADOR `userId` que já podem ser enviadas
     * (a espera após a última falha já passou), das mais antigas para as mais
     * recentes. As de outros utilizadores e as sem user_id nunca aparecem.
     */
    async listarProntas(
      userId: string,
      limite = 50,
      opcoesLista: { ignorarEspera?: boolean } = {},
    ): Promise<OperacaoFila[]> {
      exigirUtilizador(userId);
      // ignorarEspera: botão "Sincronizar agora" (não espera o fim da pausa após falha).
      const linhas = await db.getAll<LinhaFila>(
        `SELECT * FROM fila_saida
          WHERE user_id = ?
            AND estado = 'pendente'
            AND (? = 1 OR proxima_tentativa_em IS NULL OR proxima_tentativa_em <= ?)
          ORDER BY criado_em, operation_id
          LIMIT ?`,
        [
          userId,
          opcoesLista.ignorarEspera ? 1 : 0,
          paraIso(agora()),
          Math.max(0, Math.trunc(limite)),
        ],
      );
      return linhas.map(deLinha);
    },

    /**
     * Todas as operações do utilizador de um tipo que ainda não foram enviadas
     * com sucesso ("pendente" ou "a_enviar"), mesmo as que estão na pausa após
     * uma falha. Das mais antigas para as mais recentes.
     */
    async listarPorEnviarDoTipo(userId: string, tipo: TipoOperacao): Promise<OperacaoFila[]> {
      exigirUtilizador(userId);
      const linhas = await db.getAll<LinhaFila>(
        `SELECT * FROM fila_saida
          WHERE user_id = ? AND operation_type = ? AND estado IN ('pendente', 'a_enviar')
          ORDER BY criado_em, operation_id`,
        [userId, tipo],
      );
      return linhas.map(deLinha);
    },

    /**
     * Grava o payload já com os URLs reais das fotos (antes do POST).
     * Só mexe numa operação do utilizador que ainda não foi concluída.
     */
    async atualizarPayload(userId: string, operationId: string, payload: unknown): Promise<void> {
      exigirUtilizador(userId);
      await db.run(
        `UPDATE fila_saida SET payload_json = ?, atualizado_em = ?
          WHERE operation_id = ? AND user_id = ? AND estado IN ('pendente', 'a_enviar')`,
        [paraJson(payload), paraIso(agora()), operationId, userId],
      );
    },

    /**
     * Uma só operação pendente falhou antes do envio (ex.: uma foto não subiu):
     * tentativas + 1 e espera, como em aplicarResultadosSync. As outras não mudam.
     */
    async registarFalhaOperacao(userId: string, operationId: string, erro: string): Promise<void> {
      exigirUtilizador(userId);
      await db.transacao(async (tx) => {
        const linha = await tx.getFirst<{ tentativas: number }>(
          `SELECT tentativas FROM fila_saida
            WHERE operation_id = ? AND user_id = ? AND estado = 'pendente'`,
          [operationId, userId],
        );
        if (!linha) return;
        const novas = linha.tentativas + 1;
        const desiste = novas >= maxTentativas;
        const proxima = new Date(agora().getTime() + esperaAposFalha(novas));
        await tx.run(
          `UPDATE fila_saida
              SET estado = ?, tentativas = ?, ultimo_erro = ?, proxima_tentativa_em = ?,
                  atualizado_em = ?
            WHERE operation_id = ?`,
          [
            desiste ? 'falhou_definitivo' : 'pendente',
            novas,
            erro,
            desiste ? null : paraIso(proxima),
            paraIso(agora()),
            operationId,
          ],
        );
      });
    },

    /**
     * A operação nunca vai poder ser enviada (ex.: a foto foi alterada ou
     * danificada): passa logo a "falhou_definitivo", sem novas tentativas.
     * Não apaga nada: o payload e os ficheiros ficam como evidência.
     */
    async marcarFalhouDefinitivo(userId: string, operationId: string, erro: string): Promise<void> {
      exigirUtilizador(userId);
      await db.run(
        `UPDATE fila_saida
            SET estado = 'falhou_definitivo', ultimo_erro = ?, proxima_tentativa_em = NULL,
                atualizado_em = ?
          WHERE operation_id = ? AND user_id = ? AND estado IN ('pendente', 'a_enviar')`,
        [erro, paraIso(agora()), operationId, userId],
      );
    },

    /** Operações do utilizador que falharam de vez, das mais recentes para as mais antigas. */
    async listarFalhadasDoUtilizador(userId: string): Promise<OperacaoFila[]> {
      exigirUtilizador(userId);
      const linhas = await db.getAll<LinhaFila>(
        `SELECT * FROM fila_saida
          WHERE user_id = ? AND estado = 'falhou_definitivo'
          ORDER BY atualizado_em DESC, operation_id`,
        [userId],
      );
      return linhas.map(deLinha);
    },

    /**
     * O envio foi recusado por a sessão não ser válida (401): a culpa não é
     * das operações. As "a_enviar" do utilizador voltam a pendente SEM somar
     * tentativas nem mudar a espera.
     */
    async devolverAPendente(userId: string): Promise<number> {
      exigirUtilizador(userId);
      const r = await db.run(
        `UPDATE fila_saida SET estado = 'pendente', atualizado_em = ?
          WHERE estado = 'a_enviar' AND user_id = ?`,
        [paraIso(agora()), userId],
      );
      return r.alteracoes;
    },

    /**
     * Marca as operações do utilizador como "a_enviar" (chamar antes do POST).
     * Ids de outro utilizador são ignorados.
     */
    async marcarAEnviar(userId: string, operationIds: string[]): Promise<void> {
      exigirUtilizador(userId);
      if (operationIds.length === 0) return;
      await db.run(
        `UPDATE fila_saida SET estado = 'a_enviar', atualizado_em = ?
          WHERE estado = 'pendente' AND user_id = ?
            AND operation_id IN (${marcadores(operationIds.length)})`,
        [paraIso(agora()), userId, ...operationIds],
      );
    },

    /**
     * Aplica a resposta da Edge Function "sync" às operações que estavam
     * "a_enviar", com a mesma regra do site:
     * - veio nos results com status diferente de "FAILED" → concluida;
     * - veio com "FAILED" → volta a pendente, tentativas + 1, guarda o erro;
     * - não veio nos results → volta a pendente, tentativas + 1.
     *
     * Só mexe nas operações "a_enviar" do utilizador `userId`.
     * Tudo numa transação: ou se aplica a resposta inteira, ou nada.
     */
    async aplicarResultadosSync(userId: string, results: ResultadoSync[]): Promise<void> {
      exigirUtilizador(userId);
      const porId = new Map(results.map((r) => [r.operation_id, r]));
      await db.transacao(async (tx) => {
        const agoraIso = paraIso(agora());
        const enviadas = await tx.getAll<{ operation_id: string; tentativas: number }>(
          `SELECT operation_id, tentativas FROM fila_saida
            WHERE estado = 'a_enviar' AND user_id = ?`,
          [userId],
        );
        for (const { operation_id, tentativas } of enviadas) {
          const resultado = porId.get(operation_id);
          const falhou = !resultado || resultado.status.toUpperCase() === 'FAILED';
          if (!falhou) {
            await tx.run(
              `UPDATE fila_saida
                  SET estado = 'concluida', ultimo_erro = NULL, proxima_tentativa_em = NULL,
                      atualizado_em = ?
                WHERE operation_id = ?`,
              [agoraIso, operation_id],
            );
            continue;
          }
          const novasTentativas = tentativas + 1;
          const erro = resultado
            ? resultado.error ?? resultado.message ?? 'FAILED'
            : 'A operação não veio na resposta do servidor.';
          const desiste = novasTentativas >= maxTentativas || (!!resultado && erroSemVolta(erro));
          const proxima = new Date(agora().getTime() + esperaAposFalha(novasTentativas));
          await tx.run(
            `UPDATE fila_saida
                SET estado = ?, tentativas = ?, ultimo_erro = ?, proxima_tentativa_em = ?,
                    atualizado_em = ?
              WHERE operation_id = ?`,
            [
              desiste ? 'falhou_definitivo' : 'pendente',
              novasTentativas,
              erro,
              desiste ? null : paraIso(proxima),
              agoraIso,
              operation_id,
            ],
          );
        }
      });
    },

    /**
     * Quando o envio falha por inteiro (sem rede, erro 500, ...):
     * as operações "a_enviar" do utilizador voltam a pendente com tentativas + 1.
     */
    async registarFalhaEnvio(userId: string, erro: string): Promise<void> {
      exigirUtilizador(userId);
      await db.transacao(async (tx) => {
        const enviadas = await tx.getAll<{ operation_id: string; tentativas: number }>(
          `SELECT operation_id, tentativas FROM fila_saida
            WHERE estado = 'a_enviar' AND user_id = ?`,
          [userId],
        );
        for (const { operation_id, tentativas } of enviadas) {
          const novas = tentativas + 1;
          const proxima = new Date(agora().getTime() + esperaAposFalha(novas));
          await tx.run(
            `UPDATE fila_saida
                SET estado = 'pendente', tentativas = ?, ultimo_erro = ?,
                    proxima_tentativa_em = ?, atualizado_em = ?
              WHERE operation_id = ?`,
            [novas, erro, paraIso(proxima), paraIso(agora()), operation_id],
          );
        }
      });
    },

    /**
     * Devolve a "pendente" operações que ficaram "a_enviar" (por exemplo,
     * a app fechou a meio de um envio). Chamar ao arrancar a app.
     * Não conta como tentativa.
     */
    async libertarPresasAEnviar(): Promise<number> {
      const r = await db.run(
        `UPDATE fila_saida SET estado = 'pendente', atualizado_em = ? WHERE estado = 'a_enviar'`,
        [paraIso(agora())],
      );
      return r.alteracoes;
    },

    /** Quantas operações (de todos os utilizadores) ainda não foram enviadas com sucesso. */
    async contarPendentes(): Promise<number> {
      const linha = await db.getFirst<{ total: number }>(
        `SELECT COUNT(*) AS total FROM fila_saida WHERE estado IN ('pendente', 'a_enviar')`,
      );
      return linha?.total ?? 0;
    },

    /**
     * Quantas operações do utilizador ainda não foram enviadas.
     * Serve para o ecrã avisar antes de sair (sair não apaga a fila).
     */
    async contarPendentesDoUtilizador(userId: string): Promise<number> {
      exigirUtilizador(userId);
      const linha = await db.getFirst<{ total: number }>(
        `SELECT COUNT(*) AS total FROM fila_saida
          WHERE user_id = ? AND estado IN ('pendente', 'a_enviar')`,
        [userId],
      );
      return linha?.total ?? 0;
    },

    /** Apaga operações concluídas há mais de `dias` dias. Devolve quantas apagou. */
    async limparConcluidasAntigas(dias = 7): Promise<number> {
      const limite = new Date(agora().getTime() - dias * 24 * 60 * 60 * 1000);
      const r = await db.run(
        `DELETE FROM fila_saida WHERE estado = 'concluida' AND atualizado_em < ?`,
        [paraIso(limite)],
      );
      return r.alteracoes;
    },
  };
}

export type RepositorioFilaSaida = ReturnType<typeof criarRepositorioFilaSaida>;

/** Converte operações da fila no formato do pedido à Edge Function "sync". */
export function paraPedidoSync(operacoes: OperacaoFila[]): { operations: OperacaoParaSync[] } {
  return {
    operations: operacoes.map(({ operation_id, device_id, operation_type, payload }) => ({
      operation_id,
      device_id,
      operation_type,
      payload,
    })),
  };
}
