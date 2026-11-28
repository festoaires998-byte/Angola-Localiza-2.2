/** Leitura das respostas das Edge Functions geocode e generate-postal-code (sem rede, testável). */

export interface ProvinciaMunicipio {
  provincia: string | null;
  municipio: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/**
 * geocode?action=reverse devolve a resposta da LocationIQ tal como vem.
 * Província: address.state. Município: o primeiro que existir de
 * municipality, county, city, town (em Angola o OpenStreetMap costuma pôr o
 * município em county).
 */
export function lerProvinciaMunicipio(resposta: unknown): ProvinciaMunicipio {
  const morada = (resposta as { address?: Record<string, unknown> } | null)?.address ?? {};
  return {
    provincia: texto(morada.state),
    municipio:
      texto(morada.municipality) ?? texto(morada.county) ?? texto(morada.city) ?? texto(morada.town),
  };
}

export interface BairroRua {
  bairro: string | null;
  rua: string | null;
}

/**
 * Bairro e rua da mesma resposta da LocationIQ. Bairro: o primeiro que existir
 * de suburb, neighbourhood, quarter, residential, city_district, village,
 * hamlet. Rua: road, pedestrian ou street.
 */
export function lerBairroRua(resposta: unknown): BairroRua {
  const morada = (resposta as { address?: Record<string, unknown> } | null)?.address ?? {};
  const primeiro = (...chaves: string[]) => {
    for (const c of chaves) {
      const v = texto(morada[c]);
      if (v) return v;
    }
    return null;
  };
  return {
    bairro: primeiro('suburb', 'neighbourhood', 'quarter', 'residential', 'city_district', 'village', 'hamlet'),
    rua: primeiro('road', 'pedestrian', 'street'),
  };
}

export interface CodigoPostalServidor {
  codigo: string;
  /** "-N" quando já havia outra morada na mesma célula. */
  desambiguador: number | null;
}

/** Resposta de generate-postal-code?action=generate. */
export function lerCodigoPostal(resposta: unknown): CodigoPostalServidor {
  const r = resposta as { postal_code?: unknown; disambiguator?: unknown } | null;
  const codigo = texto(r?.postal_code);
  if (!codigo) throw new Error('Resposta do servidor sem código postal.');
  return { codigo, desambiguador: typeof r?.disambiguator === 'number' ? r.disambiguator : null };
}
