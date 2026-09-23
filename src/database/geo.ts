/** Contas de distância usadas para procurar moradas perto sem rede. */

/** Raio médio da Terra em metros. */
const RAIO_TERRA_M = 6_371_008.8;

/** Metros num grau de latitude (aproximado, suficiente para o filtro rápido). */
const METROS_POR_GRAU = 111_320;

function radianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function distanciaHaversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = radianos(lat2 - lat1);
  const dLng = radianos(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radianos(lat1)) * Math.cos(radianos(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Quadrado de coordenadas que contém o círculo de raio `raioM` à volta do ponto.
 * Serve para um filtro rápido (usa o índice) antes da conta exata.
 * O quadrado é um pouco maior do que o necessário, nunca mais pequeno.
 */
export function quadradoEnvolvente(lat: number, lng: number, raioM: number) {
  const margem = 1.01;
  const dLat = (raioM / METROS_POR_GRAU) * margem;
  const cosLat = Math.cos(radianos(lat));
  // Perto dos polos o cosseno tende para 0: aí aceitamos qualquer longitude.
  const dLng = cosLat > 1e-6 ? Math.min(180, dLat / cosLat) : 180;
  return {
    latMin: lat - dLat,
    latMax: lat + dLat,
    lngMin: lng - dLng,
    lngMax: lng + dLng,
  };
}
