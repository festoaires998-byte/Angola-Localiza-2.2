import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import type { TipoOperacao } from '@/database/repositories/filaSaida';
import type { Cargo, Separador } from '@/domain/organizacao/cargos';

/** Nome de cada separador, como aparece na barra de baixo. */
export const NOMES_SEPARADORES: Record<Separador, string> = {
  mapa: 'Mapa',
  guardados: 'Moradas',
  entrega: 'Enviar',
  'minhas-entregas': 'Entregas',
  campo: 'Campo',
  validar: 'Validar',
  admin: 'Gestão',
  definicoes: 'Conta',
};

export const NOMES_CARGOS: Record<Cargo, string> = {
  super_admin: 'Super administrador',
  admin_nacional: 'Administrador nacional',
  admin_provincial: 'Administrador provincial',
  admin_municipal: 'Administrador municipal',
  tecnico_campo: 'Técnico de campo',
  supervisor: 'Supervisor',
  operador_postal: 'Operador postal',
  auditor: 'Auditor',
  empresa: 'Empresa',
  estafeta: 'Estafeta',
};

export const NOMES_OPERACOES: Record<TipoOperacao, string> = {
  create_address: 'Nova morada',
  create_delivery: 'Novo pedido de entrega',
  field_submit: 'Levantamento de campo',
  delivery_proof: 'Prova de entrega',
};

/** Categorias dos favoritos (as mesmas do site). */
export const NOMES_CATEGORIAS: Record<CategoriaFavorito, string> = {
  casa: 'Casa',
  trabalho: 'Trabalho',
  familia: 'Família',
  cliente: 'Cliente',
  loja: 'Loja',
  entrega: 'Entrega',
  outro: 'Outro',
};

/** Estado da morada no servidor (addresses.status), em palavras simples. */
export function nomeEstadoMorada(estado: string | null): string {
  switch (estado) {
    case 'PROPOSED':
      return 'Proposta (à espera de validação)';
    case 'APPROVED':
      return 'Aprovada';
    case 'PUBLISHED':
      return 'Publicada';
    case 'OFFICIAL':
      return 'Oficial';
    case 'REJECTED':
      return 'Rejeitada';
    case null:
      return '—';
    default:
      return estado;
  }
}

/** Quem pode ver a morada (addresses.visibility_level). */
export function nomeVisibilidade(nivel: string | null): string {
  switch (nivel) {
    case 'PUBLIC':
      return 'Pública (visível a todos no link/cartão)';
    case 'LIMITED':
      return 'Limitada (esconde o contacto)';
    case 'PRIVATE':
      return 'Privada (só tu e os administradores)';
    case 'RESTRICTED':
      return 'Restrita';
    case null:
      return '—';
    default:
      return nivel;
  }
}

/** "1 trabalho" / "3 trabalhos". */
export function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

/** Data e hora curtas, em português (ex.: "23/09/2026, 14:05"). */
export function dataHora(iso: string | null): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}, ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "12,3 MB" */
export function megas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Precisão do GPS em palavras simples. */
export function textoPrecisao(precisao: number | null): { texto: string; qualidade: string } {
  if (precisao === null) return { texto: 'desconhecida', qualidade: '' };
  const m = Math.round(precisao);
  if (m <= 10) return { texto: `± ${m} m`, qualidade: 'boa' };
  if (m <= 30) return { texto: `± ${m} m`, qualidade: 'razoável' };
  return { texto: `± ${m} m`, qualidade: 'fraca: vai para um sítio aberto' };
}
