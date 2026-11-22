/**
 * Como o mapa acompanha a pessoa, como num jogo:
 *  - "direcao": o mapa roda para onde a pessoa está virada (bússola do
 *    telemóvel), inclina em 3D e aproxima-se; a seta fica sempre para cima.
 *  - "norte": o Norte fica em cima e o mapa fica plano; a seta roda.
 * Nos dois modos a seta do personagem aponta para onde a pessoa está virada.
 */
export type Orientacao = 'direcao' | 'norte';

export const ORIENTACAO_INICIAL: Orientacao = 'direcao';

/** Inclinação (graus) e aproximação do mapa em cada modo. */
export const VISTA: Record<Orientacao, { pitch: number; zoom: number }> = {
  direcao: { pitch: 55, zoom: 17.5 },
  norte: { pitch: 0, zoom: 16 },
};

/** O modo de seguimento da câmara do MapLibre (undefined = não segue). */
export function seguimentoCamara(orientacao: Orientacao, seguir: boolean): 'heading' | 'default' | undefined {
  if (!seguir) return undefined;
  return orientacao === 'direcao' ? 'heading' : 'default';
}

/** Para onde a câmara vai quando se escolhe um modo (o "norte" volta a pôr o Norte em cima). */
export function vistaAoEscolher(orientacao: Orientacao): { pitch: number; zoom: number; bearing?: number } {
  return orientacao === 'norte' ? { ...VISTA.norte, bearing: 0 } : { ...VISTA.direcao };
}

export function outraOrientacao(orientacao: Orientacao): Orientacao {
  return orientacao === 'direcao' ? 'norte' : 'direcao';
}

/** Texto do botão: diz o modo atual (o toque muda para o outro). */
export function rotuloOrientacao(orientacao: Orientacao): { curto: string; acessivel: string } {
  return orientacao === 'direcao'
    ? { curto: 'Direção', acessivel: 'Orientação: o mapa segue a tua direção. Tocar para pôr o Norte para cima' }
    : { curto: 'Norte', acessivel: 'Orientação: Norte para cima. Tocar para o mapa seguir a tua direção' };
}
