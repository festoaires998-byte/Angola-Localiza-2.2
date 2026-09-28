/**
 * Regiões com mapa para usar sem rede. Cada região é um ficheiro PMTiles no
 * Supabase Storage (bucket público "mapas"), gerado pelo workflow
 * .github/workflows/mapa-offline.yml a partir do OpenStreetMap (Protomaps).
 *
 * O bbox TEM de ser igual ao do workflow.
 */
export interface RegiaoMapa {
  id: string;
  nome: string;
  /** [oeste, sul, este, norte] em graus. */
  bbox: [number, number, number, number];
  /** [longitude, latitude] para abrir o mapa quando ainda não há GPS. */
  centro: [number, number];
}

export const REGIOES_OFFLINE_PALOP: Record<string, RegiaoMapa> = {
  AO: { id: 'huambo', nome: 'Huambo e arredores', bbox: [15.45, -13.0, 16.0, -12.55], centro: [15.7392, -12.7761] },
  // Os limites abaixo definem o futuro pacote nacional; os ficheiros PMTiles serão publicados separadamente.
  MZ: { id: 'mocambique', nome: 'Moçambique', bbox: [30.0, -26.9, 41.0, -10.4], centro: [32.5732, -25.9692] },
  CV: { id: 'cabo-verde', nome: 'Cabo Verde', bbox: [-25.4, 14.7, -22.6, 17.3], centro: [-23.513, 14.933] },
  GW: { id: 'guine-bissau', nome: 'Guiné-Bissau', bbox: [-16.7, 10.9, -13.6, 12.7], centro: [-15.5977, 11.8636] },
  ST: { id: 'sao-tome-principe', nome: 'São Tomé e Príncipe', bbox: [6.4, -0.1, 7.5, 1.8], centro: [6.7273, 0.3365] },
};

export const REGIAO_HUAMBO: RegiaoMapa = {
  id: 'huambo',
  nome: 'Huambo e arredores',
  bbox: [15.45, -13.0, 16.0, -12.55],
  centro: [15.7392, -12.7761],
};

export function dentroDaRegiao(regiao: RegiaoMapa, latitude: number, longitude: number): boolean {
  const [o, s, e, n] = regiao.bbox;
  return longitude >= o && longitude <= e && latitude >= s && latitude <= n;
}

/** Tipos de letra usados pelo estilo. Os nomes não têm espaços (servem de pasta). */
export const FONTES_MAPA = ['NotoSansRegular', 'NotoSansMedium', 'NotoSansItalic'] as const;
/** Intervalos de caracteres: latim básico e acentos (0-255), latim alargado e pontuação. */
export const INTERVALOS_FONTES = ['0-255', '256-511', '8192-8447'] as const;
/** Ficheiros dos ícones (sprite "light" do Protomaps). */
export const FICHEIROS_SPRITE = ['light.json', 'light.png', 'light@2x.json', 'light@2x.png'] as const;