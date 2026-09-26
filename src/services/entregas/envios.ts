import type { Entrega } from '@/database/repositories/entregas';
import type { OperacaoFila, TipoOperacao } from '@/database/repositories/filaSaida';
import {
  montarPedidoEnvio,
  type DadosEnvio,
  type Envio,
  type PedidoEnvio,
  type PinEnvio,
} from '@/domain/entregas/envio';

/**
 * Separador Enviar: tudo o que os ecrãs precisam, com e sem rede.
 * - Com rede, o pedido vai logo ao servidor: a resposta traz o código de
 *   rastreio e o PIN (o PIN só se mostra; nunca fica guardado no telemóvel).
 * - Sem rede (ou se a ligação cair antes de chegar ao servidor), o pedido vai
 *   para a fila ("create_delivery") e sai sozinho quando a rede voltar.
 * - A lista "Os meus envios" fica guardada no telemóvel (tabela entregas),
 *   para abrir sem rede.
 */

export interface DependenciasEnvios {
  servidor: {
    criar(pedido: PedidoEnvio): Promise<{ envio: Envio; pin: PinEnvio | null }>;
    listar(userId: string): Promise<Envio[]>;
    lerPin(id: string): Promise<PinEnvio>;
    gerarPin(id: string): Promise<PinEnvio>;
    cancelar(id: string): Promise<void>;
  };
  entregas: {
    guardarVarias(e: (Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string })[]): Promise<void>;
    listar(): Promise<Entrega[]>;
  };
  fila: {
    acrescentar(userId: string, tipo: TipoOperacao, payload: unknown): Promise<{ operation_id: string }>;
    porEnviar(userId: string, tipo: TipoOperacao): Promise<OperacaoFila[]>;
  };
}

export type ResultadoEnvio =
  | { tipo: 'enviado'; envio: Envio; pin: PinEnvio | null }
  | { tipo: 'na_fila'; operationId: string };

/** Pedido ainda no telemóvel, à espera de rede. */
export interface EnvioPorEnviar {
  operationId: string;
  destinatario: string;
  criadoEm: string;
  /** Última tentativa falhada (ex.: o servidor recusou), ou null. */
  erro: string | null;
}

/** Erro de rede (o pedido não chegou ao servidor): pode ir para a fila sem risco de ficar repetido. */
function semLigacao(e: unknown): boolean {
  return (e as { estado?: unknown } | null)?.estado === 0;
}

function paraLinha(envio: Envio): Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string } {
  return { id: envio.id, estado: envio.estado, dados: envio, ...(envio.atualizadoEm ? { atualizado_em: envio.atualizadoEm } : {}) };
}

/** Envio guardado no telemóvel (com os nomes da app) → Envio. */
function envioGuardado(linha: Entrega): Envio | null {
  const d = linha.dados as Partial<Envio> | null;
  if (!d || typeof d !== 'object' || typeof d.destinatario !== 'string') return null;
  return {
    id: linha.id,
    codigo: d.codigo ?? null,
    estado: linha.estado,
    destinatario: d.destinatario,
    telefone: d.telefone ?? null,
    instrucoes: d.instrucoes ?? null,
    urgente: d.urgente === true,
    criadoPor: d.criadoPor ?? null,
    estafeta: d.estafeta ?? null,
    atualizadoEm: d.atualizadoEm ?? linha.atualizado_em,
    origem: d.origem ?? null,
    morada: d.morada ?? null,
  };
}

export function criarServicoEnvios(deps: DependenciasEnvios) {
  async function doTelemovel(userId: string): Promise<Envio[]> {
    const linhas = await deps.entregas.listar();
    return linhas
      .map(envioGuardado)
      .filter((e): e is Envio => e !== null && e.criadoPor === userId);
  }

  return {
    /** Envia o pedido (com rede) ou põe-no na fila (sem rede). */
    async enviar(userId: string, dados: DadosEnvio, online: boolean): Promise<ResultadoEnvio> {
      const pedido = montarPedidoEnvio(dados);
      if (online) {
        try {
          const r = await deps.servidor.criar(pedido);
          await deps.entregas.guardarVarias([paraLinha(r.envio)]).catch(() => undefined);
          return { tipo: 'enviado', envio: r.envio, pin: r.pin };
        } catch (e) {
          if (!semLigacao(e)) throw e;
        }
      }
      const op = await deps.fila.acrescentar(userId, 'create_delivery', pedido);
      return { tipo: 'na_fila', operationId: op.operation_id };
    },

    /**
     * Os envios do utilizador. Com rede vêm do servidor e ficam guardados;
     * sem rede (ou se o servidor falhar), os guardados.
     */
    async listar(userId: string, online: boolean): Promise<{ envios: Envio[]; doServidor: boolean; erro: string | null }> {
      if (online) {
        try {
          const envios = await deps.servidor.listar(userId);
          await deps.entregas.guardarVarias(envios.map(paraLinha)).catch(() => undefined);
          return { envios, doServidor: true, erro: null };
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          return { envios: await doTelemovel(userId), doServidor: false, erro };
        }
      }
      return { envios: await doTelemovel(userId), doServidor: false, erro: null };
    },

    /** Pedidos ainda na fila (sem rede), dos mais antigos para os mais recentes. */
    async porEnviar(userId: string): Promise<EnvioPorEnviar[]> {
      const ops = await deps.fila.porEnviar(userId, 'create_delivery');
      return ops.map((op) => ({
        operationId: op.operation_id,
        destinatario: String((op.payload as Partial<PedidoEnvio> | null)?.recipient_name ?? '—'),
        criadoEm: op.criado_em,
        erro: op.ultimo_erro,
      }));
    },

    lerPin: (id: string) => deps.servidor.lerPin(id),
    gerarPin: (id: string) => deps.servidor.gerarPin(id),

    /** Cancela no servidor e atualiza a cópia do telemóvel. */
    async cancelar(envio: Envio): Promise<Envio> {
      await deps.servidor.cancelar(envio.id);
      const cancelado: Envio = { ...envio, estado: 'CANCELLED', atualizadoEm: new Date().toISOString() };
      await deps.entregas.guardarVarias([paraLinha(cancelado)]).catch(() => undefined);
      return cancelado;
    },
  };
}

export type ServicoEnvios = ReturnType<typeof criarServicoEnvios>;
