import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/** Texto obrigatório pelas regras do OpenStreetMap (licença ODbL). */
export const ATRIBUICAO_OSM = '© OpenStreetMap';

export interface OrigemMapa {
  /** "pmtiles://file:///…/huambo.pmtiles" (no telemóvel) ou "pmtiles://https://…" (pela rede). */
  tiles: string;
  /** Pasta base das fontes, sem "/" no fim: {base}/{fonte}/{intervalo}.pbf */
  fontes: string;
  /** Base do sprite, sem extensão: {base}.json / {base}.png. */
  sprite: string;
}

const FONTES_CONHECIDAS: Record<string, string> = {
  'Noto Sans Regular': 'NotoSansRegular',
  'Noto Sans Medium': 'NotoSansMedium',
  'Noto Sans Italic': 'NotoSansItalic',
};

/**
 * Troca os nomes das fontes em todo o lado onde aparecem (text-font e
 * expressões "format"): "Noto Sans Regular" → "NotoSansRegular" (as pastas
 * não têm espaços). As fontes de outras escritas (ex.: Devanagari) não são
 * descarregadas e passam a NotoSansRegular; em Angola os nomes são em latim.
 */
function semEspacos<T>(valor: T): T {
  if (typeof valor === 'string') {
    if (!valor.startsWith('Noto Sans')) return valor;
    return (FONTES_CONHECIDAS[valor] ?? 'NotoSansRegular') as T;
  }
  if (Array.isArray(valor)) return valor.map(semEspacos) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, semEspacos(v)])) as T;
  }
  return valor;
}

/**
 * Estilo MapLibre do mapa base (Protomaps "light", nomes em português).
 * Serve para o ficheiro no telemóvel e para a leitura pela rede.
 */
export function criarEstilo(origem: OrigemMapa): StyleSpecification {
  const camadas = semEspacos(layers('protomaps', namedFlavor('light'), { lang: 'pt' }));
  return {
    version: 8,
    name: 'Angola Localiza',
    glyphs: `${origem.fontes}/{fontstack}/{range}.pbf`,
    sprite: origem.sprite,
    sources: {
      protomaps: {
        type: 'vector',
        url: origem.tiles,
        attribution: ATRIBUICAO_OSM,
      },
    },
    layers: camadas as StyleSpecification['layers'],
  };
}

/** Texto obrigatório das imagens de satélite (Esri World Imagery, as mesmas do site). */
export const ATRIBUICAO_SATELITE = 'Imagens: Esri, Maxar, Earthstar Geographics';

/** Imagens de satélite: só com rede (gastam dados móveis; não ficam no telemóvel). */
export const TILES_SATELITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Estilo MapLibre da vista "Satélite" (sem nomes, como no site). */
export function criarEstiloSatelite(): StyleSpecification {
  return {
    version: 8,
    name: 'Angola Localiza · Satélite',
    sources: {
      satelite: {
        type: 'raster',
        tiles: [TILES_SATELITE],
        tileSize: 256,
        maxzoom: 19,
        attribution: ATRIBUICAO_SATELITE,
      },
    },
    layers: [{ id: 'satelite', type: 'raster', source: 'satelite' }],
  };
}
