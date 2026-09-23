import { chamarFuncao } from './edge/chamarFuncao';
import {
  lerCodigoPostal,
  lerProvinciaMunicipio,
  type CodigoPostalServidor,
  type ProvinciaMunicipio,
} from './geocodeNucleo';

export { lerCodigoPostal, lerProvinciaMunicipio } from './geocodeNucleo';
export type { CodigoPostalServidor, ProvinciaMunicipio } from './geocodeNucleo';

/**
 * Província e município de uma coordenada (Edge Function geocode, action
 * reverse). A chave da LocationIQ fica no servidor; a app nunca a tem.
 * Precisa de rede e de sessão. Devolve também a resposta completa, para guardar.
 */
export async function geocodificarInverso(
  latitude: number,
  longitude: number,
): Promise<ProvinciaMunicipio & { resposta: unknown }> {
  const resposta = await chamarFuncao<unknown>('geocode', 'reverse', {
    body: { latitude, longitude },
    tempoMaximo: 15_000,
  });
  return { ...lerProvinciaMunicipio(resposta), resposta };
}

/** Código Postal Digital confirmado pelo servidor (Edge Function generate-postal-code). */
export async function confirmarCodigoPostal(
  latitude: number,
  longitude: number,
  provincia: string | null,
): Promise<CodigoPostalServidor> {
  const resposta = await chamarFuncao<unknown>('generate-postal-code', 'generate', {
    body: { latitude, longitude, ...(provincia ? { province_name: provincia } : {}) },
    tempoMaximo: 15_000,
  });
  return lerCodigoPostal(resposta);
}
