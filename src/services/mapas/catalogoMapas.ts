import type { CodigoPais } from '@/config/pais';
import { REGIOES_OFFLINE_PALOP, type RegiaoMapa } from './regioes';

export type EstadoPublicacaoMapa = 'disponivel' | 'em_preparacao';

export interface EntradaMapaPais {
  pais: CodigoPais;
  nome: string;
  regiao: RegiaoMapa;
  estado: EstadoPublicacaoMapa;
  manifestoPath: string;
}

export const CATALOGO_MAPAS_PALOP: readonly EntradaMapaPais[] = [
  { pais: 'AO', nome: 'Angola', regiao: REGIOES_OFFLINE_PALOP.AO, estado: 'disponivel', manifestoPath: 'huambo/manifesto.json' },
  { pais: 'MZ', nome: 'Moçambique', regiao: REGIOES_OFFLINE_PALOP.MZ, estado: 'em_preparacao', manifestoPath: 'mocambique/manifesto.json' },
  { pais: 'CV', nome: 'Cabo Verde', regiao: REGIOES_OFFLINE_PALOP.CV, estado: 'em_preparacao', manifestoPath: 'cabo-verde/manifesto.json' },
  { pais: 'GW', nome: 'Guiné-Bissau', regiao: REGIOES_OFFLINE_PALOP.GW, estado: 'em_preparacao', manifestoPath: 'guine-bissau/manifesto.json' },
  { pais: 'ST', nome: 'São Tomé e Príncipe', regiao: REGIOES_OFFLINE_PALOP.ST, estado: 'em_preparacao', manifestoPath: 'sao-tome-principe/manifesto.json' },
] as const;

export function mapaDoPais(pais: CodigoPais): EntradaMapaPais {
  const codigo = pais.trim().toUpperCase();
  return CATALOGO_MAPAS_PALOP.find((m) => m.pais === codigo) ?? CATALOGO_MAPAS_PALOP[0];
}
