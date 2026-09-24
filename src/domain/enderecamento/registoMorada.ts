/**
 * Registar uma morada nova (separador Moradas, parte 2): as regras, sem React
 * e sem rede.
 *
 * O código postal é calculado pelo SERVIDOR quando a morada é aprovada, a
 * partir das coordenadas enviadas. Por isso a regra do limite das células tem
 * de ser cumprida aqui, antes de enviar:
 * - a posição tem de ter precisão melhor que ±10 m (captura não "fraca");
 * - se estiver a menos de 5 m do limite de uma célula (~38 m × 19 m), a app
 *   não deixa o código "à sorte": pede para medir no centro da entrada ou a
 *   pessoa escolhe uma das duas células. Com a escolha, a posição enviada é
 *   posta 1 m dentro da célula escolhida (anda no máximo ~6 m, menos que o
 *   erro normal do GPS), e o servidor dá de certeza o código dessa célula.
 */
import type { Captura } from './capturaGps';
import { codigoPostalProvisorio, limitesCelula } from './codigoPostal';

/** Abaixo desta distância ao limite da célula (ou da precisão, se for maior) é "junto ao limite". */
export const LIMITE_AVISO_CELULA_M = 5;
/** Quanto para dentro da célula escolhida fica a posição enviada. */
export const MARGEM_DENTRO_CELULA_M = 1;

const M_POR_GRAU_LAT = 110_574;
const mPorGrauLng = (latitude: number) => 111_320 * Math.cos((latitude * Math.PI) / 180);

/** Tipos de local (os mesmos do site). */
export const TIPOS_LOCAL = [
  'Casa',
  'Loja',
  'Restaurante',
  'Escola',
  'Hospital',
  'Farmácia',
  'Igreja',
  'Hotel',
  'Armazém',
  'Posto de combustível',
  'ATM / Banco',
  'Repartição pública',
  'Condomínio',
  'Mercado',
  'Outro',
] as const;
export type TipoLocal = (typeof TIPOS_LOCAL)[number];

export type Lado = 'norte' | 'sul' | 'este' | 'oeste';

export interface SituacaoLimite {
  /** Distância (m) ao lado mais próximo da célula. */
  distanciaM: number;
  /** De que lado está a célula vizinha mais próxima. */
  lado: Lado;
  /** Está perto demais do limite para o código ser seguro. */
  junto: boolean;
}

/** Onde está o ponto em relação aos lados da sua célula. */
export function situacaoLimite(latitude: number, longitude: number, precisaoM = 0): SituacaoLimite {
  const c = limitesCelula(latitude, longitude);
  const mLng = mPorGrauLng(latitude);
  const lados: [Lado, number][] = [
    ['sul', (latitude - c.latMin) * M_POR_GRAU_LAT],
    ['norte', (c.latMax - latitude) * M_POR_GRAU_LAT],
    ['oeste', (longitude - c.lngMin) * mLng],
    ['este', (c.lngMax - longitude) * mLng],
  ];
  const [lado, distanciaM] = lados.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { distanciaM, lado, junto: distanciaM < Math.max(LIMITE_AVISO_CELULA_M, precisaoM) };
}

export type EscolhaCelula = 'esta' | 'vizinha';

/**
 * A posição a enviar para ficar na célula escolhida: 1 m para dentro dela,
 * andando só na direção do limite mais próximo. Se já estiver a mais de 1 m
 * dentro da célula escolhida, fica igual.
 */
export function pontoNaCelula(
  latitude: number,
  longitude: number,
  escolha: EscolhaCelula,
): { latitude: number; longitude: number; deslocamentoM: number } {
  const c = limitesCelula(latitude, longitude);
  const { lado } = situacaoLimite(latitude, longitude);
  const margemLat = MARGEM_DENTRO_CELULA_M / M_POR_GRAU_LAT;
  const margemLng = MARGEM_DENTRO_CELULA_M / mPorGrauLng(latitude);
  let lat = latitude;
  let lng = longitude;
  if (escolha === 'esta') {
    if (lado === 'norte') lat = Math.min(latitude, c.latMax - margemLat);
    if (lado === 'sul') lat = Math.max(latitude, c.latMin + margemLat);
    if (lado === 'este') lng = Math.min(longitude, c.lngMax - margemLng);
    if (lado === 'oeste') lng = Math.max(longitude, c.lngMin + margemLng);
  } else {
    if (lado === 'norte') lat = c.latMax + margemLat;
    if (lado === 'sul') lat = c.latMin - margemLat;
    if (lado === 'este') lng = c.lngMax + margemLng;
    if (lado === 'oeste') lng = c.lngMin - margemLng;
  }
  const deslocamentoM = Math.hypot((lat - latitude) * M_POR_GRAU_LAT, (lng - longitude) * mPorGrauLng(latitude));
  return { latitude: lat, longitude: lng, deslocamentoM };
}

/** Os dois códigos (provisórios, sem o "-N") entre os quais a pessoa escolhe. */
export function codigosDasDuasCelulas(
  latitude: number,
  longitude: number,
  provincia: string | null,
): Record<EscolhaCelula, string> {
  const esta = pontoNaCelula(latitude, longitude, 'esta');
  const vizinha = pontoNaCelula(latitude, longitude, 'vizinha');
  return {
    esta: codigoPostalProvisorio(esta.latitude, esta.longitude, provincia).codigo,
    vizinha: codigoPostalProvisorio(vizinha.latitude, vizinha.longitude, provincia).codigo,
  };
}

export interface DadosRegisto {
  captura: Captura | null;
  /** Obrigatória quando a posição está junto ao limite. */
  escolhaCelula: EscolhaCelula | null;
  tipo: TipoLocal | null;
  /** Rua da lista do servidor… */
  ruaId: string | null;
  /** …ou o nome de uma rua que não está na lista. */
  ruaNome: string;
  referencia: string;
  /** Marcador "offline:<id>" da foto da fachada (já com marca de água). */
  foto: string | null;
  /** Há uma morada a menos de 15 m e a pessoa confirmou que é um local diferente. */
  duplicadoConfirmado: boolean;
  haDuplicado: boolean;
}

/** O que falta para poder enviar (vazio = pode enviar). */
export function faltaParaEnviar(d: DadosRegisto): string[] {
  const falta: string[] = [];
  if (!d.captura) falta.push('Esperar pela medição da posição.');
  else if (d.captura.fraca) falta.push('Precisão melhor que ±10 m: vai para um sítio aberto.');
  else if (situacaoLimite(d.captura.latitude, d.captura.longitude, d.captura.precisao).junto && !d.escolhaCelula) {
    falta.push('Junto ao limite de duas células: mede no centro da entrada ou escolhe a célula.');
  }
  if (!d.tipo) falta.push('Escolher o tipo de local.');
  if (!d.ruaId && !d.ruaNome.trim()) falta.push('Escolher a rua ou escrever o nome dela.');
  if (d.referencia.trim().length < 3) falta.push('Escrever uma referência (ex.: portão azul).');
  if (!d.foto) falta.push('Tirar a foto da fachada.');
  if (d.haDuplicado && !d.duplicadoConfirmado) falta.push('Confirmar que é um local diferente da morada que já existe perto.');
  return falta;
}

/** Pedido para a Edge Function field-service?action=submit (vai pela fila como "field_submit"). */
export interface PedidoRegisto {
  device_id: string;
  latitude: number;
  longitude: number;
  photo_facade_url: string;
  reference: string;
  place_kind: TipoLocal;
  street_id?: string;
  street_name?: string;
  accuracy_meters: number;
  override_duplicate: boolean;
  duplicate_justification: string | null;
  /** A marca de água é feita pela app com o Plus Code medido, mas não é lida de volta (OCR): fica por verificar. */
  watermark_match: null;
}

export function montarPedidoRegisto(d: DadosRegisto, deviceId: string): PedidoRegisto {
  const falta = faltaParaEnviar(d);
  if (falta.length > 0) throw new Error(falta[0]);
  const c = d.captura!;
  const junto = situacaoLimite(c.latitude, c.longitude, c.precisao).junto;
  const ponto = junto && d.escolhaCelula ? pontoNaCelula(c.latitude, c.longitude, d.escolhaCelula) : c;
  return {
    device_id: deviceId,
    latitude: ponto.latitude,
    longitude: ponto.longitude,
    photo_facade_url: d.foto!,
    reference: d.referencia.trim(),
    place_kind: d.tipo!,
    ...(d.ruaId ? { street_id: d.ruaId } : { street_name: d.ruaNome.trim() }),
    accuracy_meters: Math.round(c.precisao * 10) / 10,
    override_duplicate: d.haDuplicado && d.duplicadoConfirmado,
    duplicate_justification: d.haDuplicado && d.duplicadoConfirmado ? 'Cidadão confirma que é um local diferente.' : null,
    watermark_match: null,
  };
}

/** As duas linhas da marca de água da foto (como no site: Plus Code e data/hora). */
export function linhasMarcaDeAgua(plusCode: string, data: Date): [string, string] {
  const dois = (n: number) => String(n).padStart(2, '0');
  const quando = `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`;
  return [`Plus Code ${plusCode}`, quando];
}
