/**
 * Separador Enviar: regras puras do pedido de entrega (sem rede nem base de dados).
 * O servidor (Edge Function "deliveries", v19) volta a validar tudo.
 */

/** Estados de uma entrega no servidor (deliveries.status). */
export const ESTADOS_ENTREGA = [
  'CREATED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

const NOMES_ESTADOS: Record<EstadoEntrega, string> = {
  CREATED: 'À espera de estafeta',
  ASSIGNED: 'Com estafeta',
  PICKED_UP: 'Recolhida',
  IN_TRANSIT: 'Em trânsito',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  FAILED: 'Falhou (vai ser tentada de novo)',
  CANCELLED: 'Cancelada',
};

/** O estado em palavras simples (o código tal como veio, se for desconhecido). */
export function nomeEstadoEntrega(estado: string | null): string {
  return (NOMES_ESTADOS as Record<string, string>)[estado ?? ''] ?? estado ?? '—';
}

/** A entrega já acabou (entregue ou cancelada): não há PIN nem cancelamento. */
export function entregaTerminada(estado: string | null): boolean {
  return estado === 'DELIVERED' || estado === 'CANCELLED';
}

/** Quem criou pode cancelar enquanto a entrega não saiu para entrega nem acabou (as mesmas etapas do servidor). */
export function podeCancelar(estado: string | null): boolean {
  return ['CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'FAILED'].includes(estado ?? '');
}

/** Máximo de letras nas instruções para o estafeta. */
export const MAX_INSTRUCOES = 300;

/** O que a pessoa preenche no ecrã "Novo envio". */
export interface DadosEnvio {
  /** Id (no servidor) da morada de destino. */
  moradaId: string | null;
  destinatario: string;
  telefone: string;
  instrucoes: string;
  urgente: boolean;
}

/** Corpo de deliveries?action=create (também é o payload de "create_delivery" na fila). */
export interface PedidoEnvio {
  address_id: string;
  recipient_name: string;
  recipient_phone: string | null;
  instructions: string | null;
  is_urgent: boolean;
}

/**
 * Telefone angolano no formato "+244 9xx xxx xxx".
 * '' → null (o telefone é opcional); undefined se não for válido.
 */
export function normalizarTelefone(texto: string): string | null | undefined {
  const digitos = texto.replace(/\D/g, '');
  if (digitos === '') return null;
  const local = digitos.startsWith('244') && digitos.length === 12 ? digitos.slice(3) : digitos;
  if (!/^9\d{8}$/.test(local)) return undefined;
  return `+244 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Nome sem espaços a mais. */
function limparTexto(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

/** O que falta (ou está errado) para poder enviar, em frases simples. Vazio = pode enviar. */
export function faltaNoEnvio(d: DadosEnvio): string[] {
  const falta: string[] = [];
  if (!d.moradaId) falta.push('Escolher a morada de destino.');
  if (limparTexto(d.destinatario).length < 2) falta.push('Escrever o nome de quem vai receber.');
  if (normalizarTelefone(d.telefone) === undefined) falta.push('O telefone tem de ter 9 algarismos e começar por 9 (ex.: 923 456 789).');
  if (d.instrucoes.trim().length > MAX_INSTRUCOES) falta.push(`As instruções têm no máximo ${MAX_INSTRUCOES} letras.`);
  return falta;
}

/** Monta o pedido para o servidor. Lança erro se faltar alguma coisa. */
export function montarPedidoEnvio(d: DadosEnvio): PedidoEnvio {
  const falta = faltaNoEnvio(d);
  if (falta.length > 0) throw new Error(falta[0]);
  const instrucoes = d.instrucoes.trim();
  return {
    address_id: d.moradaId!,
    recipient_name: limparTexto(d.destinatario),
    recipient_phone: normalizarTelefone(d.telefone) ?? null,
    instructions: instrucoes === '' ? null : instrucoes,
    is_urgent: d.urgente,
  };
}

/** Uma entrega criada pelo utilizador, como a app a mostra. */
export interface Envio {
  id: string;
  /** Código de rastreio (tracking_code). */
  codigo: string | null;
  estado: string;
  destinatario: string;
  telefone: string | null;
  instrucoes: string | null;
  urgente: boolean;
  criadoPor: string | null;
  atualizadoEm: string | null;
  /** Morada de destino (códigos e referência). */
  morada: { codigoPostal: string | null; plusCode: string | null; referencia: string | null } | null;
}

/** O PIN de confirmação (só quem criou o vê; nunca fica guardado no telemóvel). */
export interface PinEnvio {
  pin: string;
  expiraEm: string | null;
  /** 5 tentativas erradas: o remetente tem de gerar um PIN novo. */
  bloqueado: boolean;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Uma linha de deliveries (da função ou da leitura direta) → Envio. */
export function lerEnvio(linha: unknown): Envio {
  const l = (linha ?? {}) as Record<string, unknown>;
  const id = texto(l.id);
  if (!id) throw new Error('Resposta do servidor sem a entrega.');
  const m = (l.addresses ?? null) as Record<string, unknown> | null;
  return {
    id,
    codigo: texto(l.tracking_code),
    estado: texto(l.status) ?? 'CREATED',
    destinatario: texto(l.recipient_name) ?? '—',
    telefone: texto(l.recipient_phone),
    instrucoes: texto(l.instructions),
    urgente: l.is_urgent === true,
    criadoPor: texto(l.created_by),
    atualizadoEm: texto(l.updated_at) ?? texto(l.created_at),
    morada: m
      ? { codigoPostal: texto(m.postal_code), plusCode: texto(m.plus_code), referencia: texto(m.reference) }
      : null,
  };
}

/** deliveries?action=get_pin / regenerate_pin → PinEnvio. */
export function lerPin(resposta: unknown): PinEnvio {
  const r = (resposta ?? {}) as Record<string, unknown>;
  const pin = texto(r.pin);
  if (!pin || !/^\d{4}$/.test(pin)) throw new Error('Resposta do servidor sem o PIN.');
  return { pin, expiraEm: texto(r.expires_at), bloqueado: r.bloqueado === true };
}

/** Erro do servidor em palavras simples para quem envia. */
export function mensagemErroEnvio(mensagem: string): string {
  if (mensagem.startsWith('CITIZEN_ID_NOT_VERIFIED')) {
    return 'A tua identidade ainda não foi verificada. Faz a verificação em Conta → Verificação da identidade.';
  }
  if (mensagem.startsWith('CONTACTO_INVALID')) return 'O telefone de quem recebe não é válido (ex.: 923 456 789).';
  if (/sem ligação|network|fetch/i.test(mensagem)) return 'Sem ligação ao servidor. Tenta de novo quando houver rede.';
  if (/entrega ja terminou/.test(mensagem)) return 'Esta entrega já terminou.';
  if (/mudou de estado/.test(mensagem)) return 'A entrega mudou entretanto. Atualiza a lista e tenta de novo.';
  if (/transicao invalida/.test(mensagem)) return 'Já não é possível cancelar: a entrega está a caminho ou terminou.';
  return mensagem;
}
