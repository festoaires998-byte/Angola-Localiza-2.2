import { sha256Hex } from '@/services/imagem/hashFoto';
import {
  chaveEstadoCidadao,
  eEstadoCidadao,
  nomeNoBucket,
  type EstadoCidadao,
} from '@/domain/identidade/verificacaoSimples';

/**
 * Verificação simples do cidadão, com envio próprio que funciona sem rede:
 * 1. as 3 fotos finais (BI frente, BI verso e as duas selfies juntas) ficam
 *    na pasta de documentos e o pedido fica guardado no telemóvel;
 * 2. com rede, cada foto sobe para o bucket PRIVADO "kyc-artifacts" (o que já
 *    subiu fica marcado: se a rede cair a meio, continua onde parou);
 * 3. no fim chama a Edge Function citizen-verify (action=submit): o servidor
 *    confirma que as 3 fotos estão no bucket e são desta pessoa e põe a
 *    verificação "em revisão"; os ficheiros locais são apagados.
 * 4. Só um administrador aprova (ou recusa, com motivo). Até lá a pessoa não
 *    pode registar moradas.
 */

export type FotoVerificacao = 'frente' | 'verso' | 'selfie';
export const FOTOS_VERIFICACAO: readonly FotoVerificacao[] = ['frente', 'verso', 'selfie'];

export interface FotoGuardada {
  uri: string;
  sha256: string;
}

export interface PedidoVerificacao {
  fotos: Record<FotoVerificacao, FotoGuardada>;
  /** Nome no bucket de cada foto que já subiu. */
  enviados: Partial<Record<FotoVerificacao, string>>;
  criadoEm: string;
}

/**
 * - verificado: aprovada por um administrador;
 * - pendente: guardada neste telemóvel, ainda por enviar;
 * - em_revisao: enviada, à espera de um administrador;
 * - rejeitado: recusada (ver o motivo); tem de tirar as fotos de novo;
 * - por_fazer: ainda não a fez.
 */
export type EstadoVerificacao = 'verificado' | 'pendente' | 'em_revisao' | 'rejeitado' | 'por_fazer';

export interface ResultadoEnvio {
  resultado: 'nada_pendente' | 'verificado' | 'em_revisao' | 'falhou';
  erro?: string;
}

export interface DependenciasVerificacao {
  preferencias: {
    obter(chave: string): Promise<string | null>;
    guardar(chave: string, valor: string): Promise<void>;
    apagar(chave: string): Promise<void>;
  };
  lerBytes(uri: string): Promise<Uint8Array>;
  apagarFicheiro(uri: string): Promise<void>;
  /** Envia para o bucket kyc-artifacts; se o ficheiro já lá estiver (reenvio), não é erro. */
  enviarFicheiro(nome: string, bytes: Uint8Array): Promise<void>;
  /** citizen-verify?action=submit com os nomes dos ficheiros no bucket; devolve o estado novo. */
  submeter(pedido: { id_photo_front_url: string; id_photo_back_url: string; selfie_url: string }): Promise<EstadoCidadao>;
  /** citizen-verify?action=status: estado no servidor (e motivo, se foi recusada). */
  lerEstadoServidor(): Promise<{ estado: EstadoCidadao; motivo: string | null }>;
  agora?(): number;
}

const chavePedido = (userId: string) => `verificacao_pendente:${userId}`;
/** A mesma chave que o registo de moradas usa para saber se a pessoa está verificada. */
export const chaveVerificado = (userId: string) => `cidadao_verificado:${userId}`;
/** Motivo da recusa (se um administrador recusou). */
export const chaveMotivoRecusa = (userId: string) => `cidadao_motivo:${userId}`;

export const ERRO_FOTO_ALTERADA = 'Uma das fotos da verificação foi alterada ou danificada neste telemóvel. Tira as fotos de novo.';

export function criarServicoVerificacao(deps: DependenciasVerificacao) {
  const agora = deps.agora ?? Date.now;
  /** Um envio de cada vez por pessoa (vários gatilhos podem pedir ao mesmo tempo). */
  const emCurso = new Map<string, Promise<ResultadoEnvio>>();

  async function lerPedido(userId: string): Promise<PedidoVerificacao | null> {
    const texto = await deps.preferencias.obter(chavePedido(userId));
    if (!texto) return null;
    try {
      return JSON.parse(texto) as PedidoVerificacao;
    } catch {
      return null;
    }
  }

  async function guardarEstado(userId: string, estado: EstadoCidadao, motivo: string | null): Promise<void> {
    await deps.preferencias.guardar(chaveVerificado(userId), estado === 'verificado' ? '1' : '0');
    await deps.preferencias.guardar(chaveEstadoCidadao(userId), estado);
    if (motivo) await deps.preferencias.guardar(chaveMotivoRecusa(userId), motivo);
    else await deps.preferencias.apagar(chaveMotivoRecusa(userId));
  }

  async function apagarFotos(pedido: PedidoVerificacao): Promise<void> {
    for (const f of FOTOS_VERIFICACAO) await deps.apagarFicheiro(pedido.fotos[f].uri).catch(() => undefined);
  }

  async function enviar(userId: string): Promise<ResultadoEnvio> {
    const pedido = await lerPedido(userId);
    if (!pedido) return { resultado: 'nada_pendente' };
    try {
      for (const f of FOTOS_VERIFICACAO) {
        if (pedido.enviados[f]) continue;
        const bytes = await deps.lerBytes(pedido.fotos[f].uri);
        if (sha256Hex(bytes) !== pedido.fotos[f].sha256.toLowerCase()) throw new Error(ERRO_FOTO_ALTERADA);
        const nome = nomeNoBucket(userId, f, agora());
        await deps.enviarFicheiro(nome, bytes);
        pedido.enviados[f] = nome;
        // Grava logo: se a rede cair a meio, a próxima vez não volta a enviar esta.
        await deps.preferencias.guardar(chavePedido(userId), JSON.stringify(pedido));
      }
      const estado = await deps.submeter({
        id_photo_front_url: pedido.enviados.frente!,
        id_photo_back_url: pedido.enviados.verso!,
        selfie_url: pedido.enviados.selfie!,
      });
      await guardarEstado(userId, estado, null);
      await deps.preferencias.apagar(chavePedido(userId));
      await apagarFotos(pedido);
      return { resultado: estado === 'verificado' ? 'verificado' : 'em_revisao' };
    } catch (e) {
      return { resultado: 'falhou', erro: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    /** Guarda o pedido (substitui um anterior por enviar, apagando as fotos antigas). */
    async guardarPedido(userId: string, fotos: Record<FotoVerificacao, FotoGuardada>): Promise<void> {
      const anterior = await lerPedido(userId);
      const pedido: PedidoVerificacao = { fotos, enviados: {}, criadoEm: new Date(agora()).toISOString() };
      await deps.preferencias.guardar(chavePedido(userId), JSON.stringify(pedido));
      if (anterior) {
        // Só as fotos antigas que já não fazem parte do pedido novo.
        const novas = new Set(FOTOS_VERIFICACAO.map((f) => fotos[f].uri));
        for (const f of FOTOS_VERIFICACAO) {
          if (!novas.has(anterior.fotos[f].uri)) await deps.apagarFicheiro(anterior.fotos[f].uri).catch(() => undefined);
        }
      }
    },

    /** O que está no telemóvel (sem rede). */
    async estado(userId: string): Promise<EstadoVerificacao> {
      if ((await deps.preferencias.obter(chaveVerificado(userId))) === '1') return 'verificado';
      if (await lerPedido(userId)) return 'pendente';
      const guardado = await deps.preferencias.obter(chaveEstadoCidadao(userId));
      if (guardado === 'em_revisao' || guardado === 'rejeitado') return guardado;
      return 'por_fazer';
    },

    /** Motivo da recusa guardado (null se não foi recusada). */
    motivoRecusa(userId: string): Promise<string | null> {
      return deps.preferencias.obter(chaveMotivoRecusa(userId));
    },

    /** Com rede: pergunta o estado ao servidor e guarda-o. Se falhar, fica o que estava. Não lança erros. */
    async atualizarDoServidor(userId: string): Promise<void> {
      try {
        const r = await deps.lerEstadoServidor();
        if (eEstadoCidadao(r.estado)) await guardarEstado(userId, r.estado, r.estado === 'rejeitado' ? r.motivo : null);
      } catch {
        // Sem resposta: usa o que está guardado.
      }
    },

    /** Envia o pedido pendente, se houver (só um envio de cada vez). Não lança erros. */
    enviarPendente(userId: string): Promise<ResultadoEnvio> {
      const atual = emCurso.get(userId);
      if (atual) return atual;
      const p = enviar(userId).finally(() => emCurso.delete(userId));
      emCurso.set(userId, p);
      return p;
    },
  };
}

export type ServicoVerificacao = ReturnType<typeof criarServicoVerificacao>;
