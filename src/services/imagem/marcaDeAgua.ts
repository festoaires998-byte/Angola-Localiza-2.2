/**
 * Medidas da faixa da marca de água (sem React, sem Skia: testável).
 * Como no site: uma faixa escura em baixo, a toda a largura, com duas linhas
 * de texto branco (Plus Code e data/hora).
 */

/** Largura máxima da foto final (px): chega para ver a fachada e poupa dados. */
export const LARGURA_FOTO = 1280;
/** Qualidade do JPEG final (0–100), a mesma do site (0,65). */
export const QUALIDADE_JPEG = 65;

export interface DesenhoMarca {
  /** Faixa: de y = altura - alturaFaixa até ao fundo. */
  alturaFaixa: number;
  tamanhoLetra: number;
  margem: number;
  /** Linha de base (y) de cada uma das duas linhas de texto. */
  yLinhas: [number, number];
}

export function desenhoMarca(largura: number, altura: number): DesenhoMarca {
  if (!(largura > 0) || !(altura > 0)) throw new Error('Foto sem tamanho.');
  // 12% da altura (mín. 56 px): duas linhas legíveis mesmo numa foto pequena.
  const alturaFaixa = Math.max(56, Math.round(altura * 0.12));
  const tamanhoLetra = Math.round(alturaFaixa * 0.3);
  const margem = Math.max(10, Math.round(largura * 0.02));
  const topo = altura - alturaFaixa;
  return {
    alturaFaixa,
    tamanhoLetra,
    margem,
    yLinhas: [Math.round(topo + alturaFaixa * 0.42), Math.round(topo + alturaFaixa * 0.82)],
  };
}
