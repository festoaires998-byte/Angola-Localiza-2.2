import { chamarFuncao } from './edge/chamarFuncao';

export interface CotacaoEntrega {
  amount_total?: number | null;
  breakdown?: { frete?: number; roteamento?: number; prova?: number; noturno_fim_de_semana?: number };
}

/** Pré-visualização de preço usada pelo formulário Enviar, alinhada com o site. */
export async function cotarEntrega(pontos: {
  originLatitude: number | null;
  originLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
}): Promise<CotacaoEntrega> {
  return chamarFuncao<CotacaoEntrega>('pricing', 'quote', {
    body: {
      zone_code_hint: null,
      organization_id: null,
      origin_latitude: pontos.originLatitude,
      origin_longitude: pontos.originLongitude,
      destination_latitude: pontos.destinationLatitude,
      destination_longitude: pontos.destinationLongitude,
    },
  });
}
