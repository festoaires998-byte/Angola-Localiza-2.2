/**
 * Verificação simples do cidadão (as regras, sem React e sem rede).
 *
 * O servidor (Edge Function citizen-verify) pede 3 ficheiros: BI frente, BI
 * verso e uma selfie. Para dificultar o uso de uma foto de outra pessoa, a
 * app tira DUAS selfies seguidas: a segunda com um gesto pedido ao acaso. As
 * duas vão juntas, lado a lado, na imagem "selfie", com o gesto e a hora na
 * marca de água (fica prova para uma revisão; não é deteção automática).
 */

export const PASSOS_VERIFICACAO = ['frente', 'verso', 'selfie', 'selfieDesafio'] as const;
export type PassoVerificacao = (typeof PASSOS_VERIFICACAO)[number];

export const NOMES_PASSOS: Record<PassoVerificacao, string> = {
  frente: 'BI — frente',
  verso: 'BI — verso',
  selfie: 'Selfie',
  selfieDesafio: 'Selfie com o gesto',
};

/** Gestos fáceis de fazer e de ver numa foto. */
export const DESAFIOS = [
  'Olha para a tua esquerda',
  'Olha para a tua direita',
  'Põe a mão aberta ao lado da cara',
  'Fecha um olho',
  'Sorri com a boca aberta',
  'Põe o polegar para cima ao lado da cara',
] as const;
export type Desafio = (typeof DESAFIOS)[number];

/**
 * Um emoji por gesto: mostra de relance o que fazer (menos esforço de leitura).
 * O Record obriga a ter um emoji para cada gesto da lista.
 */
export const EMOJI_DESAFIO: Record<Desafio, string> = {
  'Olha para a tua esquerda': '👀⬅️',
  'Olha para a tua direita': '👀➡️',
  'Põe a mão aberta ao lado da cara': '✋',
  'Fecha um olho': '😉',
  'Sorri com a boca aberta': '😁',
  'Põe o polegar para cima ao lado da cara': '👍',
};

/** Um gesto ao acaso (o gerador pode ser trocado nos testes). */
export function escolherDesafio(aleatorio: () => number = Math.random): Desafio {
  const i = Math.min(DESAFIOS.length - 1, Math.floor(aleatorio() * DESAFIOS.length));
  return DESAFIOS[Math.max(0, i)];
}

export function passoSeguinte(feitos: Partial<Record<PassoVerificacao, unknown>>): PassoVerificacao | null {
  return PASSOS_VERIFICACAO.find((p) => !feitos[p]) ?? null;
}

function dataHora(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

/** Marca de água das fotos do BI e da selfie (como no site). */
export function linhasMarcaVerificacao(data: Date, desafio?: Desafio): [string, string] {
  return ['Angola Localiza — verificação', desafio ? `${dataHora(data)} · Gesto: ${desafio}` : dataHora(data)];
}

/** Nome do ficheiro no bucket privado kyc-artifacts (um por pessoa, passo e hora). */
export function nomeNoBucket(userId: string, passo: 'frente' | 'verso' | 'selfie', agora: number): string {
  return `cidadao-${userId}-${passo}-${agora}.jpg`;
}

/**
 * Estado da verificação simples no servidor (Edge Function citizen-verify v3):
 * - verificado: um administrador aprovou (só assim se podem registar moradas);
 * - em_revisao: fotos enviadas, à espera de um administrador;
 * - rejeitado: recusada (com motivo); tem de tirar as fotos de novo;
 * - por_verificar: ainda não enviou.
 */
export type EstadoCidadao = 'verificado' | 'em_revisao' | 'rejeitado' | 'por_verificar';

/** Chave (em `preferencias`) do último estado conhecido, para o usar sem rede. */
export const chaveEstadoCidadao = (userId: string) => `cidadao_estado:${userId}`;

/** Converte a resposta do servidor (status / user_identity) no estado da app. */
export function estadoDoServidor(verificado: unknown, estado: unknown): EstadoCidadao {
  if (verificado === true || estado === 'VERIFIED') return 'verificado';
  if (estado === 'PENDING_REVIEW') return 'em_revisao';
  if (estado === 'REJECTED') return 'rejeitado';
  return 'por_verificar';
}

export function eEstadoCidadao(valor: unknown): valor is EstadoCidadao {
  return valor === 'verificado' || valor === 'em_revisao' || valor === 'rejeitado' || valor === 'por_verificar';
}
