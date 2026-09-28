import type { Entrega } from '@/database/repositories/entregas';
import { marcadorOffline, type FicheiroPendente, type NovoFicheiro } from '@/database/repositories/ficheirosPendentes';
import type { OperacaoFila, TipoOperacao } from '@/database/repositories/filaSaida';
import type { Envio } from '@/domain/entregas/envio';
import {
  payloadFalha,
  payloadPasso,
  payloadPod,
  type AcaoPendente,
  type CamposCripto,
  type DadosPod,
  type FicheiroProva,
  type LocalProva,
  type MotivoFalha,
  type Passo,
} from '@/domain/entregas/estafeta';

/**
 * Separador Entregas (estafeta), com e sem rede.
 * - Todas as ações (recolha, etapas, prova de entrega, falha) vão pela fila
 *   ("delivery_proof" → deliveries?action=update_status): com rede saem logo;
 *   sem rede saem quando a rede voltar, pela ordem em que foram feitas.
 * - As fotos e a assinatura desenhada ficam no telemóvel até subirem para o
 *   bucket privado delivery-proofs (pasta de quem envia).
 * - A prova de entrega é assinada pela chave deste aparelho (sem rede), com o
 *   SHA-256 da foto e da assinatura desenhada. Se a chave não estiver
 *   disponível, a prova segue sem essa assinatura (o servidor aceita).
 */

/** Bucket privado das provas (deliveries v19). */
export const BUCKET_PROVAS = 'delivery-proofs';

export interface FicheiroGravado {
  uri: string;
  sha256: string;
  tamanhoBytes: number;
}

export interface DependenciasEstafeta {
  servidor: { listarAtribuidas(userId: string): Promise<Envio[]>; aceitar(deliveryId: string): Promise<void> };
  entregas: {
    guardarVarias(e: (Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string })[]): Promise<void>;
    listar(): Promise<Entrega[]>;
  };
  fila: {
    acrescentar(userId: string, tipo: TipoOperacao, payload: unknown): Promise<{ operation_id: string }>;
    porEnviar(userId: string, tipo: TipoOperacao): Promise<OperacaoFila[]>;
    falhadas(userId: string): Promise<OperacaoFila[]>;
  };
  ficheiros: {
    registar(novo: NovoFicheiro): Promise<FicheiroPendente>;
    associarOperacao(id: string, operationId: string): Promise<void>;
  };
  /** Assina a prova com a chave do aparelho (ver src/services/crypto). */
  assinarProva(dados: {
    delivery_id: string;
    lat: number;
    lng: number;
    plus_code: string;
    foto_sha256: string | null;
    assinatura_manuscrita_sha256: string | null;
  }): Promise<CamposCripto>;
}

/** Uma ação do estafeta na fila, com a hora (para saber se é mais recente do que o servidor). */
export interface AcaoNaFila extends AcaoPendente {
  criadaEm: string;
}

function idDoFicheiro(marcador: string): string {
  return marcador.replace(/^offline:/, '');
}

function paraLinha(e: Envio): Omit<Entrega, 'atualizado_em'> & { atualizado_em?: string } {
  return { id: e.id, estado: e.estado, dados: e, ...(e.atualizadoEm ? { atualizado_em: e.atualizadoEm } : {}) };
}

function guardada(linha: Entrega): Envio | null {
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
    morada: d.morada ?? null,
  };
}

function deOperacao(op: OperacaoFila, erro: string | null): AcaoNaFila | null {
  const p = op.payload as { delivery_id?: unknown; new_status?: unknown } | null;
  if (!p || typeof p.delivery_id !== 'string' || typeof p.new_status !== 'string') return null;
  return { deliveryId: p.delivery_id, novo: p.new_status, erro, criadaEm: op.criado_em };
}

/**
 * Ações de uma entrega a mostrar: as que esperam rede e as recusadas que são
 * mais recentes do que a última mudança vista no servidor (as antigas já foram
 * ultrapassadas por uma ação que correu bem).
 */
export function acoesDaEntrega(envio: Envio, acoes: readonly AcaoNaFila[]): AcaoNaFila[] {
  return acoes.filter(
    (a) =>
      a.deliveryId === envio.id &&
      (a.erro === null || !envio.atualizadoEm || Date.parse(a.criadaEm) > Date.parse(envio.atualizadoEm)),
  );
}

export function criarServicoEstafeta(deps: DependenciasEstafeta) {
  async function doTelemovel(userId: string): Promise<Envio[]> {
    return (await deps.entregas.listar()).map(guardada).filter((e): e is Envio => e !== null && e.estafeta === userId);
  }

  async function porNaFila(userId: string, payload: unknown, ficheiros: (FicheiroProva | null)[]): Promise<string> {
    const op = await deps.fila.acrescentar(userId, 'delivery_proof', payload);
    for (const f of ficheiros) if (f) await deps.ficheiros.associarOperacao(idDoFicheiro(f.marcador), op.operation_id);
    return op.operation_id;
  }

  return {
    /** Aceita diretamente um pedido ainda disponível. A decisão final é atómica no servidor. */
    async aceitar(deliveryId: string): Promise<void> {
      await deps.servidor.aceitar(deliveryId);
    },

    /** Com rede vêm do servidor e ficam guardadas; sem rede (ou se falhar), as guardadas. */
    async listar(userId: string, online: boolean): Promise<{ entregas: Envio[]; doServidor: boolean; erro: string | null }> {
      if (online) {
        try {
          const entregas = await deps.servidor.listarAtribuidas(userId);
          await deps.entregas.guardarVarias(entregas.map(paraLinha)).catch(() => undefined);
          return { entregas, doServidor: true, erro: null };
        } catch (e) {
          return { entregas: await doTelemovel(userId), doServidor: false, erro: e instanceof Error ? e.message : String(e) };
        }
      }
      return { entregas: await doTelemovel(userId), doServidor: false, erro: null };
    },

    /** Ações na fila: à espera de rede (erro null) e recusadas pelo servidor (com o erro). */
    async acoes(userId: string): Promise<AcaoNaFila[]> {
      const [pendentes, falhadas] = await Promise.all([
        deps.fila.porEnviar(userId, 'delivery_proof'),
        deps.fila.falhadas(userId),
      ]);
      return [
        ...pendentes.map((op) => deOperacao(op, null)),
        ...falhadas.filter((op) => op.operation_type === 'delivery_proof').map((op) => deOperacao(op, op.ultimo_erro ?? 'Recusada pelo servidor.')),
      ]
        .filter((a): a is AcaoNaFila => a !== null)
        .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    },

    /** Regista a foto ou a assinatura (já gravadas) para subir para delivery-proofs. */
    async guardarFicheiro(f: FicheiroGravado, contentType: 'image/jpeg' | 'image/png'): Promise<FicheiroProva> {
      const registo = await deps.ficheiros.registar({
        caminho_local: f.uri,
        bucket: BUCKET_PROVAS,
        content_type: contentType,
        sha256: f.sha256,
        tamanho_bytes: f.tamanhoBytes,
      });
      return { marcador: marcadorOffline(registo.id), sha256: f.sha256, uri: f.uri };
    },

    /** Recolha (com foto), "a caminho" ou "na zona de entrega". */
    async avancar(userId: string, envio: Envio, passo: Passo, foto: FicheiroProva | null, local: LocalProva | null): Promise<string> {
      return porNaFila(userId, payloadPasso(envio.id, passo, foto, local), [foto]);
    },

    /**
     * Fecha a entrega com a prova (PIN, foto e assinatura desenhada), assinada
     * pela chave do aparelho quando está disponível.
     */
    async fechar(userId: string, envio: Envio, dados: DadosPod): Promise<{ operationId: string; assinadaPeloAparelho: boolean }> {
      let cripto: CamposCripto | null = null;
      if (dados.local && dados.foto && dados.assinatura) {
        try {
          cripto = await deps.assinarProva({
            delivery_id: envio.id,
            lat: dados.local.latitude,
            lng: dados.local.longitude,
            plus_code: dados.local.plusCode,
            foto_sha256: dados.foto.sha256,
            assinatura_manuscrita_sha256: dados.assinatura.sha256,
          });
        } catch {
          cripto = null;
        }
      }
      const payload = payloadPod(envio.id, dados, cripto);
      return { operationId: await porNaFila(userId, payload, [dados.foto, dados.assinatura]), assinadaPeloAparelho: cripto !== null };
    },

    /** "Não foi possível entregar", com o motivo (foto opcional). */
    async falhar(userId: string, envio: Envio, motivo: MotivoFalha, observacao: string, foto: FicheiroProva | null, local: LocalProva | null): Promise<string> {
      return porNaFila(userId, payloadFalha(envio.id, motivo, observacao, foto, local), [foto]);
    },
  };
}

export type ServicoEstafeta = ReturnType<typeof criarServicoEstafeta>;
