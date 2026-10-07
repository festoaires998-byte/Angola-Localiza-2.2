/**
 * Linha do tempo de uma entrega: os passos que a pessoa vê, com o passo atual
 * destacado. Regras puras (testadas em linhaTempo.test.ts).
 */

export type EstadoPasso = 'feito' | 'agora' | 'depois' | 'falhou' | 'cancelado';

export interface Passo {
  nome: string;
  detalhe: string | null;
  estado: EstadoPasso;
}

const PASSOS: { nome: string; estados: readonly string[] }[] = [
  { nome: 'Pedido criado', estados: ['CREATED'] },
  { nome: 'Com estafeta', estados: ['ASSIGNED'] },
  { nome: 'Recolhida', estados: ['PICKED_UP'] },
  { nome: 'A caminho', estados: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
  { nome: 'Entregue', estados: ['DELIVERED'] },
];

const DETALHE_AGORA: Record<string, string> = {
  CREATED: 'À espera de um estafeta',
  ASSIGNED: 'O estafeta vai buscar a encomenda',
  PICKED_UP: 'A encomenda está com o estafeta',
  IN_TRANSIT: 'A caminho do destino',
  OUT_FOR_DELIVERY: 'Quase a chegar',
  DELIVERED: 'Confirmada com o PIN de quem recebe',
};

/** Índice do passo atual (0 a 4), ou -1 para um estado desconhecido. */
export function indicePasso(estado: string | null): number {
  return PASSOS.findIndex((p) => p.estados.includes(estado ?? ''));
}

/**
 * Os passos da entrega. Uma entrega que falhou fica no passo "A caminho" em
 * vermelho (vai ser tentada de novo); uma cancelada mostra só o que chegou a
 * acontecer e o passo "Cancelada".
 */
export function passosEntrega(estado: string | null): Passo[] {
  if (estado === 'CANCELLED') {
    return [
      { nome: 'Pedido criado', detalhe: null, estado: 'feito' },
      { nome: 'Cancelada', detalhe: 'Este envio foi cancelado', estado: 'cancelado' },
    ];
  }
  const atual = estado === 'FAILED' ? 3 : Math.max(0, indicePasso(estado));
  return PASSOS.map((p, i) => {
    if (estado === 'FAILED' && i === atual) {
      return { nome: 'Não foi possível entregar', detalhe: 'Vai ser tentada de novo', estado: 'falhou' as const };
    }
    if (i < atual) return { nome: p.nome, detalhe: null, estado: 'feito' as const };
    if (i === atual) {
      // "Entregue" é o fim: fica feito, não "agora".
      const fim = estado === 'DELIVERED';
      return { nome: p.nome, detalhe: DETALHE_AGORA[estado ?? ''] ?? null, estado: fim ? ('feito' as const) : ('agora' as const) };
    }
    return { nome: p.nome, detalhe: null, estado: 'depois' as const };
  });
}
