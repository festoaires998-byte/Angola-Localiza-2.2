import { confirmarCodigoPostal, geocodificarInverso } from '@/api/geocode';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioZonasGeocodificadas } from '@/database/repositories/zonasGeocodificadas';

import { criarInfoLocal } from './infoLocal';

const repositorio = () => abrirBaseDados().then((db) => criarRepositorioZonasGeocodificadas(db));

/** Informação do local ligada à base de dados e às Edge Functions (um só para a app). */
export const infoLocal = criarInfoLocal({
  zonas: {
    obter: async (zona) => (await repositorio()).obter(zona),
    maisProxima: async (lat, lng, raio) => (await repositorio()).maisProxima(lat, lng, raio),
    guardar: async (z) => (await repositorio()).guardar(z),
  },
  geocodificar: geocodificarInverso,
  confirmarCodigo: confirmarCodigoPostal,
});
