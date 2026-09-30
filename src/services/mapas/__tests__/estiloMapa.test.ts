import { describe, expect, test } from '@jest/globals';

import { ATRIBUICAO_OSM, ATRIBUICAO_SATELITE, criarEstilo, criarEstiloOnlineOSM, criarEstiloSatelite, TILES_SATELITE } from '../estiloMapa';
import { dentroDaRegiao, FONTES_MAPA, REGIAO_HUAMBO } from '../regioes';

const ORIGEM = {
  tiles: 'pmtiles://file:///dados/mapas/huambo/huambo-20260923.pmtiles',
  fontes: 'file:///dados/mapas/recursos/fontes',
  sprite: 'file:///dados/mapas/recursos/sprite/light',
};

describe('estilo do mapa', () => {
  const estilo = criarEstilo(ORIGEM);

  test('usa o ficheiro PMTiles e mostra "© OpenStreetMap"', () => {
    expect(estilo.sources.protomaps).toEqual({ type: 'vector', url: ORIGEM.tiles, attribution: ATRIBUICAO_OSM });
    expect(ATRIBUICAO_OSM).toBe('© OpenStreetMap');
    expect(estilo.glyphs).toBe('file:///dados/mapas/recursos/fontes/{fontstack}/{range}.pbf');
    expect(estilo.sprite).toBe(ORIGEM.sprite);
  });

  test('só usa fontes que são descarregadas (sem espaços no nome)', () => {
    const usadas = new Set<string>();
    JSON.stringify(estilo.layers, (chave, valor) => {
      if (typeof valor === 'string' && valor.startsWith('NotoSans')) usadas.add(valor);
      if (typeof valor === 'string' && valor.startsWith('Noto Sans')) throw new Error(`Fonte com espaços: ${valor}`);
      return valor;
    });
    expect(usadas.size).toBeGreaterThan(0);
    for (const f of usadas) expect(FONTES_MAPA).toContain(f);
  });

  test('nomes em português', () => {
    expect(JSON.stringify(estilo.layers)).toContain('name:pt');
  });

  test('região do Huambo', () => {
    expect(dentroDaRegiao(REGIAO_HUAMBO, -12.7761, 15.7392)).toBe(true);
    expect(dentroDaRegiao(REGIAO_HUAMBO, -8.8383, 13.2344)).toBe(false); // Luanda
  });
});

describe('estilo Satélite', () => {
  test('uma camada de imagens (as do site), com a atribuição obrigatória', () => {
    const estilo = criarEstiloSatelite();
    expect(estilo.sources).toEqual({
      satelite: {
        type: 'raster',
        tiles: [TILES_SATELITE],
        tileSize: 256,
        maxzoom: 19,
        attribution: ATRIBUICAO_SATELITE,
      },
    });
    expect(TILES_SATELITE).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    expect(estilo.layers).toEqual([{ id: 'satelite', type: 'raster', source: 'satelite' }]);
  });
});

describe('estilo online OSM', () => {
  test('usa os mesmos tiles OSM online do site', () => {
    const estilo = criarEstiloOnlineOSM();
    expect(estilo.sources.osm).toEqual({
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: ATRIBUICAO_OSM,
    });
    expect(estilo.layers).toEqual([{ id: 'osm', type: 'raster', source: 'osm' }]);
  });
});
