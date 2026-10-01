import type { Entrada, ResultadoPesquisa } from '@/domain/enderecamento/pesquisa';
import type { ItemMorada } from '@/services/moradas/moradas';

/**
 * Destino de um envio a partir do que a pessoa escreveu, colou ou leu num QR
 * (Plus Code, coordenadas, link do mapa ou código postal), como no site.
 */
export type ResultadoDestino =
  /** Morada que já existe no servidor (guardada ou encontrada pelo código postal). */
  | { tipo: 'existente'; moradaId: string }
  /**
   * Morada criada agora no telemóvel (privada, por validar). Ainda pode não
   * estar no servidor: o pedido vai pela fila, logo a seguir a ela.
   */
  | { tipo: 'nova'; moradaId: string }
  | { tipo: 'erro'; mensagem: string };

export interface DependenciasDestino {
  /** As moradas guardadas no telemóvel. */
  guardadas: readonly ItemMorada[];
  online: boolean | null;
  pesquisar(query: string): Promise<ResultadoPesquisa[]>;
  /** Cria a morada (privada, por validar) e devolve o id. */
  criarMorada(ponto: { latitude: number; longitude: number }): Promise<string>;
}

/** Diferença máxima (graus, ~15 m) para dizer que é o mesmo sítio de uma morada guardada. */
const MESMO_SITIO = 0.00015;

const normalizarCodigo = (t: string) => t.toUpperCase().replace(/\s+/g, '');

export async function resolverDestino(entrada: Entrada, deps: DependenciasDestino): Promise<ResultadoDestino> {
  if (entrada.tipo === 'invalida') return { tipo: 'erro', mensagem: entrada.motivo };
  if (entrada.tipo === 'link') {
    return { tipo: 'erro', mensagem: 'Este link não tem uma localização. Usa um link do mapa, um Plus Code ou o código postal.' };
  }

  if (entrada.tipo === 'ponto') {
    const guardada = deps.guardadas.find((i) => {
      const m = i.morada;
      return (
        !!m &&
        i.favorito.pendente !== 'remover' &&
        Math.abs(m.latitude - entrada.latitude) < MESMO_SITIO &&
        Math.abs(m.longitude - entrada.longitude) < MESMO_SITIO
      );
    });
    if (guardada?.morada) {
      return { tipo: guardada.morada.origem === 'local' ? 'nova' : 'existente', moradaId: guardada.morada.id };
    }
    try {
      return { tipo: 'nova', moradaId: await deps.criarMorada({ latitude: entrada.latitude, longitude: entrada.longitude }) };
    } catch (e) {
      return { tipo: 'erro', mensagem: `Não foi possível guardar o destino neste telemóvel (${e instanceof Error ? e.message : String(e)}).` };
    }
  }

  // Texto para o servidor: só um código postal completo de uma morada que se pode usar.
  if (!deps.online) {
    return { tipo: 'erro', mensagem: 'Para usar um código postal precisas de rede. Sem rede, usa o Plus Code, um link do mapa ou o QR.' };
  }
  let resultados: ResultadoPesquisa[];
  try {
    resultados = await deps.pesquisar(entrada.query);
  } catch (e) {
    return { tipo: 'erro', mensagem: `Não foi possível procurar o código (${e instanceof Error ? e.message : String(e)}).` };
  }
  const codigo = normalizarCodigo(entrada.query);
  const morada = resultados.find((r) => r.tipo === 'morada' && r.codigoPostal !== null && normalizarCodigo(r.codigoPostal) === codigo);
  if (!morada) {
    return { tipo: 'erro', mensagem: 'Não encontrei nenhuma morada com este código postal. Confirma o código ou usa o Plus Code.' };
  }
  return { tipo: 'existente', moradaId: morada.id };
}
