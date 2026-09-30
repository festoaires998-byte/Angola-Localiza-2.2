import { describe, expect, jest, test } from '@jest/globals';

const mockChamar = jest.fn(async (..._a: unknown[]) => ({ amount_total: 2200 }));
jest.mock('../edge/chamarFuncao', () => ({ chamarFuncao: (...a: unknown[]) => mockChamar(...a) }));

import { cotarEntrega, textoCotacao } from '../pricing';

describe('Enviar: pré-visualização do preço (pricing v5)', () => {
  test('manda a morada de destino para o servidor calcular a zona', async () => {
    await cotarEntrega({ countryCode: 'AO', addressId: 'm-1', originLatitude: -12.7, originLongitude: 15.7, destinationLatitude: -12.8, destinationLongitude: 15.8 });
    expect(mockChamar).toHaveBeenCalledWith('pricing', 'quote', {
      body: expect.objectContaining({ country_code: 'AO', address_id: 'm-1', origin_latitude: -12.7 }),
    });
    const corpo = (mockChamar.mock.calls[0][2] as { body: Record<string, unknown> }).body;
    expect(corpo).not.toHaveProperty('zone_code');
  });

  test('texto: valores, moeda e zona estimada', () => {
    expect(textoCotacao({ amount_total: 3200, currency_code: 'AOA', zone_code: 'B', zone_estimated: true, breakdown: { frete: 2500, roteamento: 500, prova: 200 } }))
      .toBe('Preço estimado: Grátis durante o piloto — fora do piloto: Frete 2500 + Roteamento 500 + Prova 200 = 3200 Kz (zona B, estimada).');
    expect(textoCotacao({ amount_total: 1200, currency_code: 'MZN', breakdown: { frete: 800, roteamento: 100, prova: 100, noturno_fim_de_semana: 200 } }))
      .toBe('Preço estimado: Grátis durante o piloto — fora do piloto: Frete 800 + Roteamento 100 + Prova 100 + Noite/fim de semana 200 = 1200 MZN.');
  });
});
