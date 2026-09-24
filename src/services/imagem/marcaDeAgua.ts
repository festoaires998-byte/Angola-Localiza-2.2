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

/**
 * Onde fica cada foto quando se juntam várias lado a lado (ex.: as duas
 * selfies da verificação): todas com a mesma altura, uma a seguir à outra.
 */
export function ladoALado(tamanhos: { largura: number; altura: number }[], altura: number): {
  largura: number;
  altura: number;
  posicoes: { x: number; largura: number }[];
} {
  if (tamanhos.length === 0) throw new Error('Sem fotos para juntar.');
  let x = 0;
  const posicoes = tamanhos.map((t) => {
    if (!(t.largura > 0) || !(t.altura > 0)) throw new Error('Foto sem tamanho.');
    const largura = Math.round((t.largura * altura) / t.altura);
    const p = { x, largura };
    x += largura;
    return p;
  });
  return { largura: x, altura, posicoes };
}


/** Emojis que a marca de água pode ter no início de uma linha. */
const EMOJIS_INICIO = ['📍'] as const;

/** Separa o emoji do início da linha (desenhado com outra fonte) do resto do texto. */
export function separarEmoji(linha: string): { emoji: string | null; resto: string } {
  const emoji = EMOJIS_INICIO.find((e) => linha.startsWith(e)) ?? null;
  return emoji ? { emoji, resto: linha.slice(emoji.length).trimStart() } : { emoji: null, resto: linha };
}
