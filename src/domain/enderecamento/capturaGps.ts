/**
 * Captura de uma posição GPS a partir de várias leituras (sem React, sem hardware).
 *
 * Uma leitura sozinha pode "saltar" 10–20 m. Para o código postal não mudar de
 * célula por causa de uma leitura má:
 *   1. junta-se pelo menos 3 leituras;
 *   2. só contam as leituras com menos de ±10 m;
 *   3. faz-se a média, com mais peso nas leituras mais precisas (peso = 1/precisão²).
 * Se ao fim de 20 leituras (~20 s) não houver 3 abaixo de 10 m, fica-se com as
 * 3 melhores que houver, marcada como "fraca": o ecrã mostra o código com o aviso
 * "Pouco preciso" e continua a medir; guardar uma morada não aceita uma captura fraca.
 * Depois de medida, cada leitura nova abaixo de 10 m (perto do mesmo sítio)
 * entra na média, e a posição vai melhorando enquanto a pessoa está parada.
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
  /** true se não houve 3 leituras abaixo de ±10 m. */
  fraca: boolean;
}

/** Só as leituras com esta precisão ou melhor contam como boas. */
export const LIMITE_PRECISAO_M = 10;
/** Leituras boas precisas para uma captura. */
export const LEITURAS_NECESSARIAS = 3;
/** Ao fim de quantas leituras (uma por segundo) se mostra uma captura fraca. */
export const MAX_LEITURAS = 20;
/** Quantas leituras boas, no máximo, entram na média (as mais precisas). */
export const MAX_NA_MEDIA = 10;
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
  /** Leituras boas que fizeram a captura atual (para a ir melhorando). */
  usadas: Leitura[];
  /** Última captura feita (continua a mostrar-se enquanto se mede de novo). */
  captura: Captura | null;
  /** true enquanto se está a juntar leituras. */
  aMedir: boolean;
}

export const CAPTURA_INICIAL: EstadoCaptura = { leituras: [], usadas: [], captura: null, aMedir: true };

/** A melhor precisão das leituras da medição em curso ("melhor até agora ±15 m"). */
export function melhorPrecisao(leituras: Leitura[]): number | null {
  const p = leituras.map((l) => l.precisao).filter((x): x is number => x !== null && Number.isFinite(x) && x > 0);
  return p.length ? Math.min(...p) : null;
}

/** As leituras boas mais precisas (no máximo MAX_NA_MEDIA). */
function melhores(leituras: Leitura[]): (Leitura & { precisao: number })[] {
  return leituras
    .filter(boa)
    .sort((a, b) => a.precisao - b.precisao)
    .slice(0, MAX_NA_MEDIA);
}

/**
 * Junta uma leitura nova ao estado.
 * - A medir: guarda-a; quando há leituras que cheguem, fixa a captura.
 * - Com captura fixa (e boa): uma leitura boa perto entra na média (melhora a
 *   posição); uma leitura boa a mais de 20 m mostra que a pessoa se afastou e
 *   começa uma medição nova.
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
    if (captura.fraca) return { leituras: [], usadas: [], captura, aMedir: true };
    const usadas = melhores(leituras);
    return { leituras: [], usadas, captura: media(usadas, false), aMedir: false };
  }
  const atual = estado.captura;
  if (!atual || !boa(leitura) || estado.usadas.some((l) => l.hora === leitura.hora)) return estado;
  if (distanciaM(atual, leitura) > Math.max(DISTANCIA_NOVA_CAPTURA_M, atual.precisao)) {
    return { leituras: [leitura], usadas: [], captura: atual, aMedir: true };
  }
  // Parado: a leitura nova entra na média se estiver entre as mais precisas.
  const usadas = melhores([...estado.usadas, leitura]);
  if (!usadas.includes(leitura)) return estado;
  return { ...estado, usadas, captura: media(usadas, false) };
}

/** Botão "Medir de novo": mantém a captura à vista e começa outra medição. */
export function medirDeNovo(estado: EstadoCaptura): EstadoCaptura {
  return { leituras: [], usadas: [], captura: estado.captura, aMedir: true };
}
