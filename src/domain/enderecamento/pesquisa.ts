/**
 * Pesquisa única e leitor de QR do separador Mapa. Regras puras (sem rede).
 *
 * O que se consegue resolver no próprio telemóvel (mesmo sem rede) resolve-se
 * aqui: Plus Code, coordenadas e links de mapas (Google Maps, geo:). O resto
 * (código postal, ruas, bairros, referências) vai para o servidor (função "pesquisa").
 */
import { decode, encode, isFull, isShort, isValid, type Coordenada } from './plusCode';

export const MIN_PESQUISA = 3;
export const MAX_PESQUISA = 80;

export type Entrada =
  /** Um ponto no mapa, sem precisar de rede. */
  | { tipo: 'ponto'; latitude: number; longitude: number; origem: 'plus_code' | 'coordenadas' | 'link' }
  /** Texto para pesquisar no servidor. */
  | { tipo: 'servidor'; query: string }
  /** Um link que não é de mapas (só no leitor de QR). */
  | { tipo: 'link'; url: string }
  | { tipo: 'invalida'; motivo: string };

/** O link do QR Code (igual ao do site): abre o ponto no Google Maps. */
export function linkGoogleMaps(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/** "-12.77610, 15.73920" (5 casas: ~1 m), como o site. */
export function textoCoordenadas(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function coordenadaValida(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

const NUMERO = '(-?\\d{1,3}(?:[.]\\d+)?)';
const PAR = new RegExp(`^\\s*${NUMERO}\\s*[,;]\\s*${NUMERO}\\s*$`);
const PAR_NO_MEIO = new RegExp(`${NUMERO},\\s*${NUMERO}`);

/** "lat, lng" (com vírgula ou ponto e vírgula). */
export function lerCoordenadas(texto: string): Coordenada | null {
  const m = texto.match(PAR);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  return coordenadaValida(latitude, longitude) ? { latitude, longitude } : null;
}

/**
 * Um Plus Code curto (ex.: "Q6FM+2V") precisa de um ponto de referência
 * (o GPS ou o centro da região): escolhe a célula mais perto dele
 * (o "recoverNearest" do Open Location Code).
 */
export function recuperarPlusCode(curto: string, referencia: Coordenada): string {
  const codigo = curto.toUpperCase();
  const posSeparador = codigo.indexOf('+');
  const enchimento = 8 - posSeparador;
  const resolucao = Math.pow(20, 2 - enchimento / 2);
  const meia = resolucao / 2;
  const completo = encode(referencia.latitude, referencia.longitude).slice(0, enchimento) + codigo;
  const { centro } = decode(completo);
  let latitude = centro.latitude;
  let longitude = centro.longitude;
  if (referencia.latitude + meia < latitude && latitude - resolucao >= -90) latitude -= resolucao;
  else if (referencia.latitude - meia > latitude && latitude + resolucao <= 90) latitude += resolucao;
  if (referencia.longitude + meia < longitude) longitude -= resolucao;
  else if (referencia.longitude - meia > longitude) longitude += resolucao;
  return encode(latitude, longitude, decode(completo).comprimento);
}

function lerPlusCode(texto: string, referencia: Coordenada): Coordenada | null {
  const codigo = texto.replace(/\s/g, '').toUpperCase();
  if (!codigo.includes('+') || !isValid(codigo)) return null;
  if (isFull(codigo)) return decode(codigo).centro;
  if (isShort(codigo)) return decode(recuperarPlusCode(codigo, referencia)).centro;
  return null;
}

/** Links de mapas: google.com/maps?q=lat,lng, …/@lat,lng,17z, geo:lat,lng. */
function lerLinkMapa(texto: string): Coordenada | null {
  const t = texto.trim();
  let alvo: string | null = null;
  if (/^geo:/i.test(t)) {
    alvo = t.slice(4).split(/[?;]/)[0];
  } else if (/^https?:\/\//i.test(t)) {
    let url: URL;
    try {
      url = new URL(t);
    } catch {
      return null;
    }
    if (!/(^|\.)google\.[a-z.]+$|^maps\.app\.goo\.gl$|(^|\.)openstreetmap\.org$/i.test(url.hostname)) return null;
    alvo =
      url.searchParams.get('q') ??
      url.searchParams.get('query') ??
      url.searchParams.get('ll') ??
      (url.pathname.match(/@(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)/)?.[1] ?? null);
    if (!alvo && url.searchParams.get('mlat') && url.searchParams.get('mlon')) {
      alvo = `${url.searchParams.get('mlat')},${url.searchParams.get('mlon')}`;
    }
  }
  if (!alvo) return null;
  const m = decodeURIComponent(alvo).match(PAR_NO_MEIO);
  return m ? lerCoordenadas(`${m[1]},${m[2]}`) : null;
}

/**
 * O que a pessoa escreveu na pesquisa (ou o que o QR tem).
 * @param referencia Para os Plus Codes curtos: onde a pessoa está (ou o centro do mapa).
 */
export function interpretarEntrada(texto: string, referencia: Coordenada): Entrada {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t.length === 0) return { tipo: 'invalida', motivo: 'Escreve o que queres encontrar.' };

  const link = lerLinkMapa(t);
  if (link) return { tipo: 'ponto', ...link, origem: 'link' };
  if (/^https?:\/\//i.test(t)) return { tipo: 'link', url: t };

  const coordenadas = lerCoordenadas(t);
  if (coordenadas) return { tipo: 'ponto', ...coordenadas, origem: 'coordenadas' };

  const plus = lerPlusCode(t, referencia);
  if (plus) return { tipo: 'ponto', ...plus, origem: 'plus_code' };

  if (t.length < MIN_PESQUISA) return { tipo: 'invalida', motivo: `Escreve pelo menos ${MIN_PESQUISA} letras.` };
  if (t.length > MAX_PESQUISA) return { tipo: 'invalida', motivo: `Escreve no máximo ${MAX_PESQUISA} letras.` };
  return { tipo: 'servidor', query: t };
}

/** Um resultado da função "pesquisa" do servidor. */
export interface ResultadoPesquisa {
  tipo: 'morada' | 'rua' | 'bairro';
  id: string;
  titulo: string;
  subtitulo: string | null;
  latitude: number | null;
  longitude: number | null;
  codigoPostal: string | null;
  plusCode: string | null;
}

function textoOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function numeroOuNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Lê a resposta do servidor (ignora linhas estragadas, sem falhar). */
export function lerResultados(resposta: unknown): ResultadoPesquisa[] {
  const lista = (resposta as { resultados?: unknown } | null)?.resultados;
  if (!Array.isArray(lista)) throw new Error('Resposta do servidor inesperada (pesquisa).');
  const saida: ResultadoPesquisa[] = [];
  for (const r of lista as Record<string, unknown>[]) {
    const tipo = r?.tipo;
    const id = textoOuNull(r?.id);
    const titulo = textoOuNull(r?.titulo);
    if ((tipo !== 'morada' && tipo !== 'rua' && tipo !== 'bairro') || !id || !titulo) continue;
    const latitude = numeroOuNull(r.latitude);
    const longitude = numeroOuNull(r.longitude);
    const temPonto = latitude !== null && longitude !== null && coordenadaValida(latitude, longitude);
    saida.push({
      tipo,
      id,
      titulo,
      subtitulo: textoOuNull(r.subtitulo),
      latitude: temPonto ? latitude : null,
      longitude: temPonto ? longitude : null,
      codigoPostal: textoOuNull(r.codigo_postal),
      plusCode: textoOuNull(r.plus_code),
    });
  }
  return saida;
}

/** Texto do "Partilhar" do Mapa (igual para quem tem ou não tem a app). */
export function textoPartilhaLocal(p: {
  latitude: number;
  longitude: number;
  plusCode: string;
  codigoPostal: string | null;
}): string {
  return [
    'A minha localização (Angola Localiza)',
    p.codigoPostal ? `Código Postal Digital: ${p.codigoPostal}` : null,
    `Plus Code: ${p.plusCode}`,
    `Coordenadas: ${textoCoordenadas(p.latitude, p.longitude)}`,
    linkGoogleMaps(p.latitude, p.longitude),
  ]
    .filter(Boolean)
    .join('\n');
}
