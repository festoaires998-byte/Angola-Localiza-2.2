import { sha256Hex } from '@/services/imagem/hashFoto';
import { nomeNoBucket } from '@/domain/identidade/verificacaoSimples';

/**
 * Verificação simples do cidadão, com envio próprio que funciona sem rede:
 * 1. as 3 fotos finais (BI frente, BI verso e as duas selfies juntas) ficam
 *    na pasta de documentos e o pedido fica guardado no telemóvel;
 * 2. com rede, cada foto sobe para o bucket PRIVADO "kyc-artifacts" (o que já
 *    subiu fica marcado: se a rede cair a meio, continua onde parou);
 * 3. no fim chama a Edge Function citizen-verify (action=submit) e, se
 *    aceitar, a pessoa fica verificada e os ficheiros locais são apagados.
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

export type EstadoVerificacao = 'verificado' | 'pendente' | 'por_fazer';

export interface ResultadoEnvio {
  resultado: 'nada_pendente' | 'verificado' | 'falhou';
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
  /** citizen-verify?action=submit com os nomes dos ficheiros no bucket. */
  submeter(pedido: { id_photo_front_url: string; id_photo_back_url: string; selfie_url: string }): Promise<void>;
  agora?(): number;
}

const chavePedido = (userId: string) => `verificacao_pendente:${userId}`;
/** A mesma chave que o registo de moradas usa para saber se a pessoa está verificada. */
export const chaveVerificado = (userId: string) => `cidadao_verificado:${userId}`;

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
      await deps.submeter({
        id_photo_front_url: pedido.enviados.frente!,
        id_photo_back_url: pedido.enviados.verso!,
        selfie_url: pedido.enviados.selfie!,
      });
      await deps.preferencias.guardar(chaveVerificado(userId), '1');
      await deps.preferencias.apagar(chavePedido(userId));
      await apagarFotos(pedido);
      return { resultado: 'verificado' };
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
      return (await lerPedido(userId)) ? 'pendente' : 'por_fazer';
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
