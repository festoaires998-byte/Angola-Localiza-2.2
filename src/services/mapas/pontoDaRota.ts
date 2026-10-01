import type { PontoEncontrado } from '@/hooks/usePesquisaMapa';

/** Parâmetros que outro ecrã passa ao Mapa para mostrar um ponto (ex.: o destino de uma entrega). */
export interface ParametrosPonto {
  lat?: string | string[];
  lng?: string | string[];
  titulo?: string | string[];
}

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lê o ponto dos parâmetros da rota; null se faltar ou não for uma coordenada válida. */
export function pontoDaRota(p: ParametrosPonto): PontoEncontrado | null {
  const latTexto = primeiro(p.lat)?.trim();
  const lngTexto = primeiro(p.lng)?.trim();
  if (!latTexto || !lngTexto) return null;
  const latitude = Number(latTexto);
  const longitude = Number(lngTexto);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  const titulo = primeiro(p.titulo)?.trim().slice(0, 120) || 'Ponto';
  return { latitude, longitude, titulo };
}

/** Parâmetros para abrir o Mapa centrado num ponto. */
export function parametrosDoPonto(ponto: PontoEncontrado): { lat: string; lng: string; titulo: string } {
  return { lat: String(ponto.latitude), lng: String(ponto.longitude), titulo: ponto.titulo };
}
