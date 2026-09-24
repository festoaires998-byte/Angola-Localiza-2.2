/**
 * Plus Code (Open Location Code) — especificação oficial da Google.
 *
 * Um Plus Code transforma uma coordenada (latitude, longitude) num texto
 * curto, por exemplo "6FJ4MQ66+2V". Cada par de letras escolhe uma
 * "quadrícula" cada vez mais pequena dentro do mapa do mundo.
 *
 * Este ficheiro é código de domínio puro: não usa React, Expo nem hardware.
 *
 * Para evitar erros de arredondamento, fazemos as contas com números
 * inteiros (tal como a implementação oficial): primeiro convertemos a
 * coordenada num número inteiro de "passos" muito pequenos e só depois
 * tiramos os dígitos com divisões inteiras.
 */

/** Uma coordenada geográfica em graus decimais. */
export interface Coordenada {
  latitude: number;
  longitude: number;
}

/** A área (retângulo) que um Plus Code representa, e o seu centro. */
export interface AreaPlusCode {
  /** Limite sul (latitude mínima), incluído. */
  latitudeMin: number;
  /** Limite oeste (longitude mínima), incluído. */
  longitudeMin: number;
  /** Limite norte (latitude máxima), excluído. */
  latitudeMax: number;
  /** Limite este (longitude máxima), excluído. */
  longitudeMax: number;
  /** Ponto central da área. */
  centro: Coordenada;
  /** Número de dígitos do código (sem contar o "+" nem o "0" de enchimento). */
  comprimento: number;
}

// ---------------------------------------------------------------------------
// Constantes da especificação
// ---------------------------------------------------------------------------

/** As 20 letras e números usados. Não há vogais, para não formar palavras. */
const ALFABETO = '23456789CFGHJMPQRVWX';
/** Separador que aparece depois do 8.º dígito. */
const SEPARADOR = '+';
/** Posição do separador (depois de 8 dígitos). */
const POSICAO_SEPARADOR = 8;
/** Carácter usado para encher códigos curtos (ex.: "6FJ40000+"). */
const ENCHIMENTO = '0';
/** Base da numeração: cada dígito tem 20 valores possíveis. */
const BASE = 20;
/** Os primeiros 10 dígitos são pares (latitude, longitude). */
const COMPRIMENTO_PARES = 10;
/** Máximo de dígitos que a especificação permite. */
const MAX_DIGITOS = 15;
/** Depois dos pares, a grelha divide cada célula em 5 linhas... */
const LINHAS_GRELHA = 5;
/** ...e 4 colunas (20 sub-células, uma por letra do alfabeto). */
const COLUNAS_GRELHA = 4;
/** Número de dígitos de grelha possíveis (15 - 10). */
const DIGITOS_GRELHA = MAX_DIGITOS - COMPRIMENTO_PARES;

const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;

/** Quantos passos há num grau, depois dos 5 pares: 20^3 = 8000. */
const PRECISAO_PARES = BASE * BASE * BASE;
/** Quantos passos há num grau de latitude, ao nível mais fino: 8000 × 5^5. */
const PRECISAO_FINAL_LAT = PRECISAO_PARES * LINHAS_GRELHA ** DIGITOS_GRELHA; // 25 000 000
/** Quantos passos há num grau de longitude, ao nível mais fino: 8000 × 4^5. */
const PRECISAO_FINAL_LNG = PRECISAO_PARES * COLUNAS_GRELHA ** DIGITOS_GRELHA; // 8 192 000

/** Total de passos de norte a sul e de oeste a este. */
const TOTAL_PASSOS_LAT = 2 * LATITUDE_MAX * PRECISAO_FINAL_LAT;
const TOTAL_PASSOS_LNG = 2 * LONGITUDE_MAX * PRECISAO_FINAL_LNG;

/** Comprimento por omissão: 10 dígitos + 1 dígito de grelha (~3 m). */
export const COMPRIMENTO_PADRAO = 11;

// ---------------------------------------------------------------------------
// Passo 1: coordenada → números inteiros
// ---------------------------------------------------------------------------

/**
 * Converte graus em "passos" inteiros.
 *
 * Multiplicar um número decimal pode dar, por exemplo, 2029999999.9999998
 * em vez de 2030000000. Por isso arredondamos primeiro a 6 casas decimais e
 * só depois cortamos a parte decimal (é o que faz a versão oficial).
 */
function paraPassos(graus: number, precisao: number): number {
  return Math.floor(Math.round(graus * precisao * 1e6) / 1e6);
}

/** Transforma latitude e longitude em dois números inteiros não negativos. */
function coordenadaParaInteiros(latitude: number, longitude: number): [number, number] {
  // Latitude: somamos 90° para que o polo sul fique em 0.
  let lat = paraPassos(latitude, PRECISAO_FINAL_LAT) + LATITUDE_MAX * PRECISAO_FINAL_LAT;
  // Não pode sair do mapa. O polo norte (90°) fica na última célula,
  // porque o limite norte de uma célula não lhe pertence.
  if (lat < 0) lat = 0;
  else if (lat >= TOTAL_PASSOS_LAT) lat = TOTAL_PASSOS_LAT - 1;

  // Longitude: somamos 180° para que -180° fique em 0.
  let lng = paraPassos(longitude, PRECISAO_FINAL_LNG) + LONGITUDE_MAX * PRECISAO_FINAL_LNG;
  // A longitude dá a volta ao mundo: 180° é o mesmo que -180°, 190° é -170°.
  lng = ((lng % TOTAL_PASSOS_LNG) + TOTAL_PASSOS_LNG) % TOTAL_PASSOS_LNG;

  return [lat, lng];
}

// ---------------------------------------------------------------------------
// Passo 2: números inteiros → código
// ---------------------------------------------------------------------------

/**
 * Gera o Plus Code de uma coordenada.
 *
 * @param latitude  Latitude em graus (-90 a 90).
 * @param longitude Longitude em graus (qualquer valor; dá a volta ao mundo).
 * @param comprimento Número de dígitos. 10 = formato do site (~14 m);
 *   11 (padrão) acrescenta o dígito de grelha (~3 m). Aceita 2, 4, 6, 8 e 10 a 15.
 */
export function encode(
  latitude: number,
  longitude: number,
  comprimento: number = COMPRIMENTO_PADRAO,
): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Coordenada inválida: latitude e longitude têm de ser números.');
  }
  if (
    !Number.isInteger(comprimento) ||
    comprimento < 2 ||
    (comprimento < COMPRIMENTO_PARES && comprimento % 2 === 1)
  ) {
    throw new Error(`Comprimento de Plus Code inválido: ${comprimento}.`);
  }
  comprimento = Math.min(comprimento, MAX_DIGITOS);

  let [lat, lng] = coordenadaParaInteiros(latitude, longitude);

  // Construímos o código da direita para a esquerda.
  let codigo = '';

  // 2a. Dígitos de grelha (posições 11 a 15). Cada um escolhe uma das
  // 20 sub-células: linha (0-4) × 4 + coluna (0-3).
  for (let i = 0; i < DIGITOS_GRELHA; i++) {
    const linha = lat % LINHAS_GRELHA;
    const coluna = lng % COLUNAS_GRELHA;
    codigo = ALFABETO.charAt(linha * COLUNAS_GRELHA + coluna) + codigo;
    lat = Math.floor(lat / LINHAS_GRELHA);
    lng = Math.floor(lng / COLUNAS_GRELHA);
  }

  // 2b. Os 5 pares (posições 1 a 10): em cada par, primeiro a latitude,
  // depois a longitude, cada uma em base 20.
  for (let i = 0; i < COMPRIMENTO_PARES / 2; i++) {
    codigo = ALFABETO.charAt(lng % BASE) + codigo;
    codigo = ALFABETO.charAt(lat % BASE) + codigo;
    lat = Math.floor(lat / BASE);
    lng = Math.floor(lng / BASE);
  }

  // 2c. Pomos o "+" depois do 8.º dígito.
  codigo = codigo.slice(0, POSICAO_SEPARADOR) + SEPARADOR + codigo.slice(POSICAO_SEPARADOR);

  // 2d. Cortamos ao comprimento pedido (+1 por causa do "+").
  if (comprimento >= POSICAO_SEPARADOR) {
    return codigo.slice(0, comprimento + 1);
  }
  // Códigos com menos de 8 dígitos são enchidos com "0" até ao "+".
  return codigo.slice(0, comprimento).padEnd(POSICAO_SEPARADOR, ENCHIMENTO) + SEPARADOR;
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Diz se um texto é um Plus Code válido (completo ou curto).
 * Aceita letras minúsculas.
 */
export function isValid(codigo: string): boolean {
  if (typeof codigo !== 'string' || codigo.length < 2) return false;

  // Tem de ter exatamente um "+".
  const posSeparador = codigo.indexOf(SEPARADOR);
  if (posSeparador === -1 || posSeparador !== codigo.lastIndexOf(SEPARADOR)) return false;

  // O "+" fica no máximo na posição 8 e sempre numa posição par.
  if (posSeparador > POSICAO_SEPARADOR || posSeparador % 2 === 1) return false;

  // Regras do enchimento com "0".
  const posEnchimento = codigo.indexOf(ENCHIMENTO);
  if (posEnchimento > -1) {
    // Só códigos completos (com "+" na posição 8) podem ter enchimento.
    if (posSeparador < POSICAO_SEPARADOR) return false;
    // Não pode começar por "0".
    if (posEnchimento === 0) return false;
    // Um único bloco de zeros, com tamanho par e no máximo 6.
    const blocos = codigo.match(/0+/g) ?? [];
    const zeros = blocos[0] ?? '';
    if (blocos.length > 1 || zeros.length % 2 === 1 || zeros.length > POSICAO_SEPARADOR - 2) {
      return false;
    }
    // Depois do enchimento, o código tem de acabar no "+".
    if (codigo.charAt(codigo.length - 1) !== SEPARADOR) return false;
  }

  // Depois do "+" não pode haver só um carácter.
  if (codigo.length - posSeparador - 1 === 1) return false;

  // Todos os outros caracteres têm de pertencer ao alfabeto.
  const semExtras = codigo.replace(SEPARADOR, '').replace(/0+/, '');
  for (const caracter of semExtras.toUpperCase()) {
    if (!ALFABETO.includes(caracter)) return false;
  }
  return true;
}

/**
 * Diz se é um código curto (ex.: "MQ66+2V"), que só faz sentido junto de
 * uma localidade de referência.
 */
export function isShort(codigo: string): boolean {
  if (!isValid(codigo)) return false;
  return codigo.indexOf(SEPARADOR) < POSICAO_SEPARADOR;
}

/** Diz se é um código completo, que aponta para um único sítio no mundo. */
export function isFull(codigo: string): boolean {
  if (!isValid(codigo) || isShort(codigo)) return false;
  const maiusculas = codigo.toUpperCase();
  // O primeiro dígito de latitude não pode passar dos 180° (90 + 90).
  if (ALFABETO.indexOf(maiusculas.charAt(0)) * BASE >= LATITUDE_MAX * 2) return false;
  // O primeiro dígito de longitude não pode passar dos 360°.
  if (ALFABETO.indexOf(maiusculas.charAt(1)) * BASE >= LONGITUDE_MAX * 2) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Descodificação: código → área
// ---------------------------------------------------------------------------

/**
 * Descodifica um Plus Code completo e devolve a área que ele representa,
 * com o respetivo centro. Lança um erro se o código não for completo.
 */
export function decode(codigo: string): AreaPlusCode {
  if (!isFull(codigo)) {
    throw new Error(`Plus Code inválido ou incompleto: "${codigo}".`);
  }

  // Tiramos o "+" e o enchimento; ficam só os dígitos.
  const digitos = codigo.replace(SEPARADOR, '').replace(/0/g, '').toUpperCase();
  const comprimento = Math.min(digitos.length, MAX_DIGITOS);

  // Vamos somar, em passos inteiros, o canto sudoeste da área.
  let lat = 0;
  let lng = 0;
  // Tamanho de uma célula, também em passos inteiros. Começamos com 400°
  // para que, depois de dividir por 20, cada dígito do 1.º par valha 20°
  // (tanto na latitude como na longitude, como manda a especificação).
  let alturaCelula = BASE * BASE * PRECISAO_FINAL_LAT;
  let larguraCelula = BASE * BASE * PRECISAO_FINAL_LNG;

  // 1. Os pares: cada dígito divide a célula em 20 partes.
  const digitosPares = Math.min(comprimento, COMPRIMENTO_PARES);
  for (let i = 0; i < digitosPares; i += 2) {
    alturaCelula /= BASE;
    larguraCelula /= BASE;
    lat += ALFABETO.indexOf(digitos.charAt(i)) * alturaCelula;
    lng += ALFABETO.indexOf(digitos.charAt(i + 1)) * larguraCelula;
  }

  // 2. A grelha: cada dígito divide a célula em 5 linhas × 4 colunas.
  for (let i = COMPRIMENTO_PARES; i < comprimento; i++) {
    const valor = ALFABETO.indexOf(digitos.charAt(i));
    alturaCelula /= LINHAS_GRELHA;
    larguraCelula /= COLUNAS_GRELHA;
    lat += Math.floor(valor / COLUNAS_GRELHA) * alturaCelula;
    lng += (valor % COLUNAS_GRELHA) * larguraCelula;
  }

  // 3. Tiramos os 90° / 180° que somámos no encode (ainda em inteiros) e
  // convertemos de passos para graus com uma única divisão no fim.
  const latitudeMin = (lat - LATITUDE_MAX * PRECISAO_FINAL_LAT) / PRECISAO_FINAL_LAT;
  const longitudeMin = (lng - LONGITUDE_MAX * PRECISAO_FINAL_LNG) / PRECISAO_FINAL_LNG;
  const latitudeMax = (lat + alturaCelula - LATITUDE_MAX * PRECISAO_FINAL_LAT) / PRECISAO_FINAL_LAT;
  const longitudeMax =
    (lng + larguraCelula - LONGITUDE_MAX * PRECISAO_FINAL_LNG) / PRECISAO_FINAL_LNG;

  return {
    latitudeMin: arredondar(latitudeMin),
    longitudeMin: arredondar(longitudeMin),
    latitudeMax: arredondar(latitudeMax),
    longitudeMax: arredondar(longitudeMax),
    centro: {
      // O centro nunca passa do polo norte nem da linha dos 180°.
      latitude: Math.min(arredondar((latitudeMin + latitudeMax) / 2), LATITUDE_MAX),
      longitude: Math.min(arredondar((longitudeMin + longitudeMax) / 2), LONGITUDE_MAX),
    },
    comprimento,
  };
}

/** Arredonda a 14 casas decimais para esconder restos como 0.30000000000000004. */
function arredondar(valor: number): number {
  return Math.round(valor * 1e14) / 1e14;
}
