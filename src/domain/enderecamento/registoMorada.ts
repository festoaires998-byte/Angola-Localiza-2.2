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

/** Com "Outro", a pessoa escreve o tipo real (ex.: Padaria); tamanho máximo. */
export const TIPO_OUTRO_MAX = 40;

/**
 * O tipo que vai para o servidor (place_kind). Com "Outro", vai a descrição
 * escrita (ex.: "Padaria"), para não se perder o que o local é de facto. O
 * servidor guarda-o como texto no início da referência ("[Padaria] …"), sem
 * lista fechada.
 */
export function tipoAEnviar(tipo: TipoLocal, tipoOutro: string): string {
  if (tipo !== 'Outro') return tipo;
  return tipoOutro.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim().slice(0, TIPO_OUTRO_MAX);
}

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

/**
 * A posição que vai ser enviada: a medida, ou — junto ao limite, depois de a
 * pessoa escolher a célula — 1 m dentro da célula escolhida. É também esta
 * posição que se usa para pedir as ruas e os bairros da zona, para as
 * sugestões serem da célula escolhida.
 */
export function pontoAEnviar(
  c: Pick<Captura, 'latitude' | 'longitude' | 'precisao'>,
  escolha: EscolhaCelula | null,
): { latitude: number; longitude: number } {
  const junto = situacaoLimite(c.latitude, c.longitude, c.precisao).junto;
  if (!junto || !escolha) return { latitude: c.latitude, longitude: c.longitude };
  const p = pontoNaCelula(c.latitude, c.longitude, escolha);
  return { latitude: p.latitude, longitude: p.longitude };
}

export interface DadosRegisto {
  captura: Captura | null;
  /** Obrigatória quando a posição está junto ao limite. */
  escolhaCelula: EscolhaCelula | null;
  tipo: TipoLocal | null;
  /** Descrição do tipo quando é "Outro" (obrigatória nesse caso). */
  tipoOutro: string;
  /** Rua da lista do servidor… */
  ruaId: string | null;
  /** …ou o nome de uma rua que não está na lista. */
  ruaNome: string;
  /**
   * A rua não tem nome (nem oficial nem conhecido). O servidor cria uma
   * "Rua S/Nº" na quadra (new_unnamed_street), em vez de um nome inventado.
   */
  ruaSemNome: boolean;
  /** Bairro (da lista de bairros conhecidos perto, ou escrito à mão). */
  bairro: string;
  /** O bairro não tem nome: vai sem bairro (neighborhood_name null). */
  bairroSemNome: boolean;
  referencia: string;
  /** Marcador "offline:<id>" da foto da fachada (já com marca de água). */
  foto: string | null;
  /** Há uma morada a menos de 15 m e a pessoa confirmou que é um local diferente. */
  duplicadoConfirmado: boolean;
  haDuplicado: boolean;
}

/**
 * Sem nome de rua ou de bairro, a referência é o que guia quem procura a
 * morada: tem de ser mais completa (ex.: "portão azul, ao lado da igreja").
 */
export const REFERENCIA_MIN = 3;
export const REFERENCIA_MIN_SEM_NOME = 10;

/** Quantas letras a referência tem de ter (mais quando falta o nome da rua ou do bairro). */
export function minimoReferencia(d: Pick<DadosRegisto, 'ruaId' | 'ruaSemNome' | 'bairroSemNome'>): number {
  return (d.ruaSemNome && !d.ruaId) || d.bairroSemNome ? REFERENCIA_MIN_SEM_NOME : REFERENCIA_MIN;
}

/** O que falta para poder enviar (vazio = pode enviar). */
export function faltaParaEnviar(d: DadosRegisto, localidadeLabel = 'bairro'): string[] {
  const falta: string[] = [];
  const localidade = localidadeLabel.trim() || 'bairro';
  const inicialMaiuscula = localidade.charAt(0).toUpperCase() + localidade.slice(1);
  if (!d.captura) falta.push('Esperar pela medição da posição.');
  else if (d.captura.fraca) falta.push('Precisão melhor que ±10 m: vai para um sítio aberto.');
  else if (situacaoLimite(d.captura.latitude, d.captura.longitude, d.captura.precisao).junto && !d.escolhaCelula) {
    falta.push('Junto ao limite de duas células: mede no centro da entrada ou escolhe a célula.');
  }
  if (!d.tipo) falta.push('Escolher o tipo de local.');
  else if (d.tipo === 'Outro' && tipoAEnviar('Outro', d.tipoOutro).length < 3) {
    falta.push('Descrever o tipo de local (ex.: Padaria, Oficina).');
  }
  if (!d.ruaId && !d.ruaSemNome && !d.ruaNome.trim()) {
    falta.push('Escolher a rua, escrever o nome dela ou marcar "Esta rua não tem nome".');
  }
  if (!d.bairroSemNome && d.bairro.trim().length < 2) {
    falta.push(`Escolher ${localidade}, escrever o nome dela ou marcar "Esta ${localidade} não tem nome".`);
  }
  const minimo = minimoReferencia(d);
  if (d.referencia.trim().length < minimo) {
    falta.push(
      minimo === REFERENCIA_MIN
        ? 'Escrever uma referência (ex.: portão azul).'
        : `Sem nome de rua ou de ${localidade}, a referência guia quem procura: escreve pelo menos ${REFERENCIA_MIN_SEM_NOME} letras (ex.: portão azul, ao lado da igreja).`,
    );
  }
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
  /** Um dos TIPOS_LOCAL ou, com "Outro", a descrição escrita (ex.: "Padaria"). */
  place_kind: string;
  street_id?: string;
  street_name?: string;
  /** A rua não tem nome: o servidor cria uma "Rua S/Nº" na quadra. */
  new_unnamed_street?: true;
  /** null quando o bairro não tem nome. */
  neighborhood_name: string | null;
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
  const ponto = pontoAEnviar(c, d.escolhaCelula);
  return {
    device_id: deviceId,
    latitude: ponto.latitude,
    longitude: ponto.longitude,
    photo_facade_url: d.foto!,
    reference: d.referencia.trim(),
    place_kind: tipoAEnviar(d.tipo!, d.tipoOutro),
    ...(d.ruaId
      ? { street_id: d.ruaId }
      : d.ruaSemNome
        ? { new_unnamed_street: true as const }
        : { street_name: d.ruaNome.trim() }),
    neighborhood_name: d.bairroSemNome ? null : d.bairro.replace(/\s+/g, ' ').trim(),
    accuracy_meters: Math.round(c.precisao * 10) / 10,
    override_duplicate: d.haDuplicado && d.duplicadoConfirmado,
    duplicate_justification: d.haDuplicado && d.duplicadoConfirmado ? 'Cidadão confirma que é um local diferente.' : null,
    watermark_match: null,
  };
}

/**
 * As duas linhas da marca de água da foto da fachada — o mesmo formato
 * exigido aos técnicos de campo:
 *   1.ª "📍 <Plus Code> · <latitude>, <longitude>" (5 casas decimais, ~1 m);
 *   2.ª a data e a hora.
 */
export function linhasMarcaDeAgua(plusCode: string, latitude: number, longitude: number, data: Date): [string, string] {
  const dois = (n: number) => String(n).padStart(2, '0');
  const quando = `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`;
  return [`📍 ${plusCode} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, quando];
}
