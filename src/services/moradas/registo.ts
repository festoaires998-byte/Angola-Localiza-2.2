import { codigoQuadra, type Duplicado, type Rua, type RuasDaQuadra } from '@/api/registoNucleo';
import { idDoMarcador, marcadorOffline, type FicheiroPendente, type NovoFicheiro } from '@/database/repositories/ficheirosPendentes';
import type { TipoOperacao } from '@/database/repositories/filaSaida';
import type { Referencia } from '@/database/repositories/referencias';
import { montarPedidoRegisto, type DadosRegisto, type PedidoRegisto } from '@/domain/enderecamento/registoMorada';
import { chaveEstadoCidadao, eEstadoCidadao, type EstadoCidadao } from '@/domain/identidade/verificacaoSimples';

/**
 * Registar uma morada nova: tudo o que o ecrã precisa, com e sem rede.
 * - O envio vai SEMPRE pela fila de sincronização ("field_submit"), com a foto
 *   guardada no telemóvel (marcador "offline:<id>"): com rede sai logo; sem
 *   rede sai quando a rede voltar. Nunca se perde.
 * - As ruas de cada quadra e a verificação do cidadão ficam guardadas para
 *   funcionarem sem rede.
 */

/** Bucket do Storage das fotos de campo (o mesmo do site). */
export const BUCKET_FOTOS = 'field-photos';

/**
 * Só "verificado" (aprovada por um administrador) pode registar moradas:
 * - pendente: a verificação está guardada no telemóvel, ainda por enviar;
 * - em_revisao: enviada, à espera de um administrador;
 * - rejeitado: recusada; tem de a fazer de novo;
 * - por_verificar: ainda não a fez;
 * - desconhecido: sem rede e sem resposta guardada (deixa registar com aviso;
 *   o servidor volta a confirmar ao receber).
 */
export type Verificacao = EstadoCidadao | 'pendente' | 'desconhecido';

/** Pode registar moradas com esta verificação? */
export const podeRegistar = (v: Verificacao | null) => v === 'verificado' || v === 'desconhecido';

export interface FotoPronta {
  /** Ficheiro final (já com a marca de água) na pasta de documentos. */
  uri: string;
  sha256: string;
  tamanhoBytes: number;
}

export interface DependenciasRegisto {
  ficheiros: {
    registar(novo: NovoFicheiro): Promise<FicheiroPendente>;
    associarOperacao(id: string, operationId: string): Promise<void>;
  };
  acrescentarOperacao(userId: string, tipo: TipoOperacao, payload: unknown): Promise<{ operation_id: string }>;
  idDispositivo(): Promise<string>;
  referencias: {
    guardarVarias(r: Omit<Referencia, 'atualizado_em'>[]): Promise<void>;
    listar(tipo: 'rua' | 'bairro', paiId: string): Promise<Referencia[]>;
  };
  preferencias: { obter(chave: string): Promise<string | null>; guardar(chave: string, valor: string): Promise<void> };
  servidor: {
    pedirRuasDaQuadra(latitude: number, longitude: number): Promise<RuasDaQuadra>;
    procurarDuplicado(latitude: number, longitude: number): Promise<Duplicado | null>;
    lerVerificacaoCidadao(userId: string): Promise<EstadoCidadao>;
  };
}

const chaveVerificacao = (userId: string) => `cidadao_verificado:${userId}`;
/** Pedido de verificação guardado no telemóvel (ver src/services/identidade/verificacao.ts). */
const chavePedidoVerificacao = (userId: string) => `verificacao_pendente:${userId}`;

export function criarServicoRegisto(deps: DependenciasRegisto) {
  return {
    /**
     * Ruas conhecidas na quadra do ponto. Com rede vêm do servidor e ficam
     * guardadas; sem rede (ou se o servidor falhar), as guardadas.
     */
    async ruasPerto(
      latitude: number,
      longitude: number,
      online: boolean,
    ): Promise<{ ruas: Rua[]; bairros: string[]; doServidor: boolean }> {
      if (online) {
        try {
          const r = await deps.servidor.pedirRuasDaQuadra(latitude, longitude);
          await deps.referencias
            .guardarVarias([
              ...r.ruas.map((rua) => ({ tipo: 'rua' as const, id: rua.id, pai_id: r.quadra, nome: rua.nome, dados: null })),
              // Os bairros não têm id no servidor: o id é "quadra:nome".
              ...r.bairros.map((b) => ({ tipo: 'bairro' as const, id: `${r.quadra}:${b}`, pai_id: r.quadra, nome: b, dados: null })),
            ])
            .catch(() => undefined);
          return { ruas: r.ruas, bairros: r.bairros, doServidor: true };
        } catch {
          // Usa as guardadas.
        }
      }
      const quadra = codigoQuadra(latitude, longitude);
      const [ruas, bairros] = await Promise.all([
        deps.referencias.listar('rua', quadra).catch(() => []),
        deps.referencias.listar('bairro', quadra).catch(() => []),
      ]);
      return { ruas: ruas.map((g) => ({ id: g.id, nome: g.nome })), bairros: bairros.map((b) => b.nome), doServidor: false };
    },

    /** Morada a menos de 15 m? undefined = não se sabe (sem rede; o servidor volta a ver ao receber). */
    async duplicadoPerto(latitude: number, longitude: number, online: boolean): Promise<Duplicado | null | undefined> {
      if (!online) return undefined;
      return deps.servidor.procurarDuplicado(latitude, longitude).catch(() => undefined);
    },

    /** Estado da verificação simples. Com rede pergunta e guarda; sem rede, a última resposta. */
    async verificacao(userId: string, online: boolean): Promise<Verificacao> {
      let resposta: Verificacao | null = null;
      if (online) {
        try {
          const estado = await deps.servidor.lerVerificacaoCidadao(userId);
          await deps.preferencias.guardar(chaveVerificacao(userId), estado === 'verificado' ? '1' : '0').catch(() => undefined);
          await deps.preferencias.guardar(chaveEstadoCidadao(userId), estado).catch(() => undefined);
          resposta = estado;
        } catch {
          // Usa a guardada.
        }
      }
      if (!resposta) {
        const estado = await deps.preferencias.obter(chaveEstadoCidadao(userId)).catch(() => null);
        const guardada = await deps.preferencias.obter(chaveVerificacao(userId)).catch(() => null);
        resposta =
          guardada === '1' ? 'verificado' : eEstadoCidadao(estado) ? estado : guardada === '0' ? 'por_verificar' : 'desconhecido';
      }
      if (resposta === 'verificado') return resposta;
      const pedido = await deps.preferencias.obter(chavePedidoVerificacao(userId)).catch(() => null);
      return pedido ? 'pendente' : resposta;
    },

    /** Regista a foto final (com marca de água) para envio e devolve o marcador "offline:<id>". */
    async guardarFoto(foto: FotoPronta): Promise<string> {
      const f = await deps.ficheiros.registar({
        caminho_local: foto.uri,
        bucket: BUCKET_FOTOS,
        content_type: 'image/jpeg',
        sha256: foto.sha256,
        tamanho_bytes: foto.tamanhoBytes,
      });
      return marcadorOffline(f.id);
    },

    /** Põe o registo na fila (e liga a foto à operação). Devolve o pedido enviado. */
    async enviar(userId: string, dados: DadosRegisto): Promise<{ operationId: string; pedido: PedidoRegisto }> {
      const pedido = montarPedidoRegisto(dados, await deps.idDispositivo());
      const op = await deps.acrescentarOperacao(userId, 'field_submit', pedido);
      const idFoto = idDoMarcador(pedido.photo_facade_url);
      if (idFoto) await deps.ficheiros.associarOperacao(idFoto, op.operation_id);
      return { operationId: op.operation_id, pedido };
    },
  };
}

export type ServicoRegisto = ReturnType<typeof criarServicoRegisto>;
