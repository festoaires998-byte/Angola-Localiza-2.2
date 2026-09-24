/**
 * "Os meus registos" (separador Moradas): as moradas que a pessoa registou e em
 * que ponto estão. Regras puras (sem rede nem base de dados).
 *
 * O servidor guarda o registo em field_records (estado PENDING_REVIEW até um
 * validador decidir). Quando é aprovado, cria a morada (resulting_address_id),
 * mas não a põe nos favoritos: é a app que a junta, uma só vez.
 */
import type { CategoriaFavorito } from '@/database/repositories/favoritos';

export type EstadoRegisto = 'a_espera_rede' | 'por_validar' | 'aprovado' | 'rejeitado' | 'duplicado';

export interface Registo {
  /** Id do registo no servidor (ou da operação na fila, se ainda não foi enviado). */
  id: string;
  estado: EstadoRegisto;
  /** Tipo de local (o "[Casa]" do início da referência), ou null. */
  tipo: string | null;
  referencia: string;
  bairro: string | null;
  enviadoEm: string | null;
  validadoEm: string | null;
  /** Morada criada na aprovação. */
  moradaId: string | null;
  codigoPostal: string | null;
  numeroPorta: string | null;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** "[Casa] Portão castanho" → { tipo: "Casa", texto: "Portão castanho" }. */
export function separarTipo(referencia: string): { tipo: string | null; texto: string } {
  const m = referencia.match(/^\s*\[([^\]]{1,40})\]\s*(.*)$/s);
  return m ? { tipo: m[1].trim(), texto: m[2].trim() } : { tipo: null, texto: referencia.trim() };
}

const CATEGORIAS: Record<string, CategoriaFavorito> = {
  casa: 'casa',
  residencia: 'casa',
  loja: 'loja',
  comercio: 'loja',
  trabalho: 'trabalho',
  escritorio: 'trabalho',
  empresa: 'trabalho',
};

/** Categoria do favorito a partir do tipo de local ("Casa" → casa; os outros → outro). */
export function categoriaDoTipo(tipo: string | null): CategoriaFavorito {
  const chave = (tipo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return CATEGORIAS[chave] ?? 'outro';
}

function estadoDoServidor(status: unknown): EstadoRegisto {
  switch (status) {
    case 'APPROVED':
      return 'aprovado';
    case 'REJECTED':
      return 'rejeitado';
    case 'DUPLICATE':
      return 'duplicado';
    default:
      return 'por_validar';
  }
}

/**
 * Linhas de field_records (as da própria pessoa) + as moradas criadas na
 * aprovação (id → código postal e número) → Registo[].
 */
export function lerRegistos(
  linhas: unknown,
  moradas: ReadonlyMap<string, { codigoPostal: string | null; numeroPorta: string | null }>,
): Registo[] {
  if (!Array.isArray(linhas)) throw new Error('Resposta do servidor inesperada (registos).');
  const resultado: Registo[] = [];
  for (const l of linhas as Record<string, unknown>[]) {
    const id = texto(l?.id);
    if (!id) continue;
    const { tipo, texto: referencia } = separarTipo(texto(l.reference) ?? '');
    const moradaId = texto(l.resulting_address_id);
    const morada = moradaId ? moradas.get(moradaId) : undefined;
    resultado.push({
      id,
      estado: estadoDoServidor(l.status),
      tipo,
      referencia,
      bairro: texto(l.neighborhood_name),
      enviadoEm: texto(l.collected_at),
      validadoEm: texto(l.validated_at),
      moradaId,
      codigoPostal: morada?.codigoPostal ?? null,
      numeroPorta: morada?.numeroPorta ?? null,
    });
  }
  return resultado;
}

/** Registo ainda na fila do telemóvel (payload de field_submit) → Registo "à espera de rede". */
export function registoDaFila(operationId: string, payload: unknown, criadoEm: string): Registo {
  const p = (payload ?? {}) as Record<string, unknown>;
  const { tipo, texto: referencia } = separarTipo(texto(p.reference) ?? '');
  return {
    id: operationId,
    estado: 'a_espera_rede',
    tipo: tipo ?? texto(p.place_kind),
    referencia,
    bairro: texto(p.neighborhood_name),
    enviadoEm: criadoEm,
    validadoEm: null,
    moradaId: null,
    codigoPostal: null,
    numeroPorta: null,
  };
}

/** Estado do registo em palavras simples. */
export function nomeEstadoRegisto(r: Registo): string {
  switch (r.estado) {
    case 'a_espera_rede':
      return 'À espera de rede para ser enviado';
    case 'por_validar':
      return 'À espera de validação';
    case 'aprovado':
      return [
        'Aprovado',
        r.codigoPostal,
        r.numeroPorta ? `nº ${r.numeroPorta}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'rejeitado':
      return 'Não foi aceite pela validação';
    case 'duplicado':
      return 'Já existia uma morada neste sítio';
  }
}

/** Aprovados cuja morada ainda não foi posta nos favoritos pela app. */
export function aprovadosPorJuntar(registos: readonly Registo[], jaJuntados: ReadonlySet<string>): Registo[] {
  return registos.filter((r) => r.estado === 'aprovado' && r.moradaId !== null && !jaJuntados.has(r.moradaId));
}
