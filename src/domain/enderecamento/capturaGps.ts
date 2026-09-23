/**
 * Captura de uma posição GPS a partir de várias leituras (sem React, sem hardware).
 *
 * Uma leitura sozinha pode "saltar" 10–20 m. Para o código postal não mudar de
 * célula por causa de uma leitura má:
 *   1. junta-se pelo menos 3 leituras;
 *   2. deitam-se fora as piores que ±30 m;
 *   3. faz-se a média, com mais peso nas leituras mais precisas (peso = 1/precisão²).
 * Se ao fim de 10 leituras não houver 3 boas, fica-se com as melhores que houver,
 * marcada como "fraca" (o ecrã avisa; guardar uma morada deve pedir outra medição).
 *
 * Usado pelo Mapa (o código mostrado) e, mais tarde, ao guardar uma morada.
 */

export interface Leitura {
  latitude: number;
  longitude: number;
  /** Precisão em metros (raio); null se o GPS não a deu. */
  precisao: number | null;
  /** Quando foi lida (ms desde 1970). */
  hora: number;
}

export interface Captura {
  latitude: number;
  longitude: number;
  /** A melhor precisão entre as leituras usadas, em metros. */
  precisao: number;
  /** Quantas leituras entraram na média. */
  leituras: number;
  /** true se não houve 3 leituras boas (todas piores que ±30 m). */
  fraca: boolean;
}

/** Leituras piores que isto não entram na média (se houver leituras boas que cheguem). */
export const LIMITE_PRECISAO_M = 30;
/** Leituras boas precisas para uma captura. */
export const LEITURAS_NECESSARIAS = 3;
/** Ao fim de quantas leituras se desiste de esperar por 3 boas. */
export const MAX_LEITURAS = 10;
/** Distância mínima para medir de novo quando a pessoa se afasta da captura. */
export const DISTANCIA_NOVA_CAPTURA_M = 20;

function boa(l: Leitura): l is Leitura & { precisao: number } {
  return l.precisao !== null && Number.isFinite(l.precisao) && l.precisao > 0 && l.precisao <= LIMITE_PRECISAO_M;
}

/** Média com peso 1/precisão² (uma leitura de ±5 m pesa 16 vezes mais que uma de ±20 m). */
function media(leituras: (Leitura & { precisao: number })[], fraca: boolean): Captura {
  let somaPesos = 0;
  let lat = 0;
  let lng = 0;
  for (const l of leituras) {
    const peso = 1 / (l.precisao * l.precisao);
    somaPesos += peso;
    lat += l.latitude * peso;
    lng += l.longitude * peso;
  }
  return {
    latitude: lat / somaPesos,
    longitude: lng / somaPesos,
    precisao: Math.min(...leituras.map((l) => l.precisao)),
    leituras: leituras.length,
    fraca,
  };
}

/** Quantas das leituras contam como boas (para mostrar "leitura 2 de 3"). */
export function leiturasBoas(leituras: Leitura[]): number {
  return leituras.filter(boa).length;
}

/**
 * A captura feita com estas leituras, ou null se ainda é preciso esperar
 * por mais leituras.
 */
export function combinarLeituras(leituras: Leitura[]): Captura | null {
  const boas = leituras.filter(boa);
  if (boas.length >= LEITURAS_NECESSARIAS) return media(boas, false);
  if (leituras.length < MAX_LEITURAS) return null;
  // Sinal fraco: as 3 melhores que tenham precisão.
  const comPrecisao = leituras
    .filter((l): l is Leitura & { precisao: number } => l.precisao !== null && Number.isFinite(l.precisao) && l.precisao > 0)
    .sort((a, b) => a.precisao - b.precisao)
    .slice(0, LEITURAS_NECESSARIAS);
  return comPrecisao.length > 0 ? media(comPrecisao, true) : null;
}

/** Distância aproximada em metros (chega para distâncias curtas). */
export function distanciaM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.sqrt(x * x + y * y) * R;
}

export interface EstadoCaptura {
  /** Leituras da medição em curso. */
  leituras: Leitura[];
  /** Última captura feita (continua a mostrar-se enquanto se mede de novo). */
  captura: Captura | null;
  /** true enquanto se está a juntar leituras. */
  aMedir: boolean;
}

export const CAPTURA_INICIAL: EstadoCaptura = { leituras: [], captura: null, aMedir: true };

/**
 * Junta uma leitura nova ao estado.
 * - A medir: guarda-a; quando há leituras que cheguem, fixa a captura.
 * - Com captura fixa (e boa): só volta a medir se uma leitura boa mostra que a
 *   pessoa se afastou mais de 20 m (ou mais que a precisão da captura).
 * - Com captura fraca: continua a medir, para melhorar quando o sinal melhorar.
 */
export function juntarLeitura(estado: EstadoCaptura, leitura: Leitura): EstadoCaptura {
  if (!Number.isFinite(leitura.latitude) || !Number.isFinite(leitura.longitude)) return estado;
  if (estado.aMedir) {
    if (estado.leituras.some((l) => l.hora === leitura.hora)) return estado;
    // Só as últimas 10 (se o GPS nunca der a precisão, a lista não cresce sem fim).
    const leituras = [...estado.leituras, leitura].slice(-MAX_LEITURAS);
    const captura = combinarLeituras(leituras);
    if (!captura) return { ...estado, leituras };
    return { leituras: [], captura, aMedir: captura.fraca };
  }
  const atual = estado.captura;
  if (atual && boa(leitura) && distanciaM(atual, leitura) > Math.max(DISTANCIA_NOVA_CAPTURA_M, atual.precisao)) {
    return { leituras: [leitura], captura: atual, aMedir: true };
  }
  return estado;
}

/** Botão "Medir de novo": mantém a captura à vista e começa outra medição. */
export function medirDeNovo(estado: EstadoCaptura): EstadoCaptura {
  return { leituras: [], captura: estado.captura, aMedir: true };
}
