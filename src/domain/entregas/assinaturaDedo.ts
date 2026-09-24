/**
 * Assinatura desenhada com o dedo: os traços (listas de pontos) e o desenho
 * em SVG. Regras puras; o PNG final é gravado em src/services/imagem/assinaturaPng.ts.
 */

export interface Ponto {
  x: number;
  y: number;
}

export type Traco = Ponto[];

/** Caminho SVG ("M x y L x y …") dos traços, com 1 casa decimal. */
export function caminhoSvg(tracos: readonly Traco[]): string {
  const n = (v: number) => Math.round(v * 10) / 10;
  return tracos
    .filter((t) => t.length > 0)
    .map((t) => {
      const [primeiro, ...resto] = t;
      // Um toque só (um ponto) desenha um ponto pequeno.
      const pontos = resto.length > 0 ? resto : [{ x: primeiro.x + 0.1, y: primeiro.y }];
      return `M${n(primeiro.x)} ${n(primeiro.y)}${pontos.map((p) => ` L${n(p.x)} ${n(p.y)}`).join('')}`;
    })
    .join(' ');
}

/** Comprimento total dos traços (em pontos do ecrã). */
export function comprimento(tracos: readonly Traco[]): number {
  let total = 0;
  for (const t of tracos) {
    for (let i = 1; i < t.length; i++) total += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
  }
  return total;
}

/** Uma assinatura a sério, não um toque sem querer: pelo menos 60 pontos de comprimento. */
export function assinaturaValida(tracos: readonly Traco[]): boolean {
  return comprimento(tracos) >= 60;
}
