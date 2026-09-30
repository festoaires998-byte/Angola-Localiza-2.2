import { chamarFuncao } from './edge/chamarFuncao';

export interface CotacaoEntrega {
  amount_total?: number | null;
  currency_code?: string;
  zone_code?: string;
  /** true quando a zona foi calculada pelo servidor (sem saber o município da recolha). */
  zone_estimated?: boolean;
  is_free_pilot?: boolean;
  breakdown?: { frete?: number; roteamento?: number; prova?: number; noturno_fim_de_semana?: number };
}

/**
 * Pré-visualização de preço usada pelo formulário Enviar, alinhada com o site.
 * A zona é calculada no servidor (pricing v5) a partir da morada de destino
 * (addressId) e, se se souber, do município/província da recolha.
 */
export async function cotarEntrega(pontos: {
  countryCode?: string;
  addressId?: string | null;
  originMunicipalityId?: string | null;
  originProvinceId?: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
}): Promise<CotacaoEntrega> {
  return chamarFuncao<CotacaoEntrega>('pricing', 'quote', {
    body: {
      country_code: pontos.countryCode ?? 'AO',
      address_id: pontos.addressId ?? null,
      origin_municipality_id: pontos.originMunicipalityId ?? null,
      origin_province_id: pontos.originProvinceId ?? null,
      organization_id: null,
      origin_latitude: pontos.originLatitude,
      origin_longitude: pontos.originLongitude,
      destination_latitude: pontos.destinationLatitude,
      destination_longitude: pontos.destinationLongitude,
    },
  });
}

/** Texto do preço para o ecrã Enviar (o piloto é grátis; mostra o valor fora do piloto). */
export function textoCotacao(c: CotacaoEntrega): string {
  const b = c.breakdown ?? {};
  const moeda = c.currency_code === 'AOA' || !c.currency_code ? 'Kz' : c.currency_code;
  const zona = c.zone_code ? ` (zona ${c.zone_code}${c.zone_estimated ? ', estimada' : ''})` : '';
  const noturno = b.noturno_fim_de_semana ? ` + Noite/fim de semana ${b.noturno_fim_de_semana}` : '';
  return `Preço estimado: Grátis durante o piloto — fora do piloto: Frete ${b.frete ?? 0} + Roteamento ${b.roteamento ?? 0} + Prova ${b.prova ?? 0}${noturno} = ${c.amount_total ?? 0} ${moeda}${zona}.`;
}
