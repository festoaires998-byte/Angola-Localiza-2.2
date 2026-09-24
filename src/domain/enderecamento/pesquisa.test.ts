import { describe, expect, test } from '@jest/globals';

import {
  interpretarEntrada,
  lerCoordenadas,
  lerResultados,
  linkGoogleMaps,
  recuperarPlusCode,
  textoCoordenadas,
  textoPartilhaLocal,
} from './pesquisa';
import { decode, encode } from './plusCode';

const HUAMBO = { latitude: -12.7761, longitude: 15.7392 };

describe('link e textos', () => {
  test('link do Google Maps com 6 casas decimais', () => {
    expect(linkGoogleMaps(-12.7761234567, 15.7392)).toBe('https://www.google.com/maps?q=-12.776123,15.739200');
  });

  test('coordenadas com 5 casas, como o site', () => {
    expect(textoCoordenadas(-12.7761234, 15.73921)).toBe('-12.77612, 15.73921');
  });

  test('texto de partilha com e sem código postal', () => {
    const base = { latitude: -12.7761, longitude: 15.7392, plusCode: '6GXCQ6FM+2V' };
    expect(textoPartilhaLocal({ ...base, codigoPostal: 'AO-HUA-MNFQR6JW-41' })).toBe(
      [
        'A minha localização (Angola Localiza)',
        'Código Postal Digital: AO-HUA-MNFQR6JW-41',
        'Plus Code: 6GXCQ6FM+2V',
        'Coordenadas: -12.77610, 15.73920',
        'https://www.google.com/maps?q=-12.776100,15.739200',
      ].join('\n'),
    );
    expect(textoPartilhaLocal({ ...base, codigoPostal: null })).not.toMatch(/Código Postal/);
  });
});

describe('coordenadas', () => {
  test('lê "lat, lng" e "lat;lng"', () => {
    expect(lerCoordenadas('-12.7761, 15.7392')).toEqual({ latitude: -12.7761, longitude: 15.7392 });
    expect(lerCoordenadas(' -12.7761 ; 15.7392 ')).toEqual({ latitude: -12.7761, longitude: 15.7392 });
  });

  test('recusa fora dos limites, 0,0 e texto', () => {
    expect(lerCoordenadas('91, 15')).toBeNull();
    expect(lerCoordenadas('-12, 181')).toBeNull();
    expect(lerCoordenadas('0, 0')).toBeNull();
    expect(lerCoordenadas('Rua 5, 12')).toBeNull();
  });
});

describe('Plus Code curto', () => {
  test('recupera o código completo a partir de um ponto perto', () => {
    const completo = encode(HUAMBO.latitude, HUAMBO.longitude);
    const curto = completo.slice(4);
    expect(recuperarPlusCode(curto, { latitude: -12.79, longitude: 15.76 })).toBe(completo);
  });

  test('escolhe a célula mais perto mesmo do outro lado de um limite', () => {
    // Um ponto junto ao limite de uma célula de 0,05°, com a referência na célula vizinha.
    const ponto = { latitude: -12.7999, longitude: 15.7501 };
    const completo = encode(ponto.latitude, ponto.longitude);
    const curto = completo.slice(4);
    expect(recuperarPlusCode(curto, { latitude: -12.8001, longitude: 15.7499 })).toBe(completo);
  });
});

describe('interpretarEntrada', () => {
  test('Plus Code completo → ponto, sem rede', () => {
    const codigo = encode(HUAMBO.latitude, HUAMBO.longitude);
    const r = interpretarEntrada(codigo.toLowerCase(), HUAMBO);
    expect(r).toEqual({ tipo: 'ponto', ...decode(codigo).centro, origem: 'plus_code' });
  });

  test('Plus Code curto → ponto perto da referência', () => {
    const codigo = encode(HUAMBO.latitude, HUAMBO.longitude);
    const r = interpretarEntrada(codigo.slice(4), HUAMBO);
    expect(r).toEqual({ tipo: 'ponto', ...decode(codigo).centro, origem: 'plus_code' });
  });

  test('coordenadas → ponto', () => {
    expect(interpretarEntrada('-12.7761, 15.7392', HUAMBO)).toEqual({
      tipo: 'ponto',
      latitude: -12.7761,
      longitude: 15.7392,
      origem: 'coordenadas',
    });
  });

  test('links de mapas → ponto', () => {
    const esperado = { tipo: 'ponto', latitude: -12.7761, longitude: 15.7392, origem: 'link' };
    expect(interpretarEntrada('https://www.google.com/maps?q=-12.7761,15.7392', HUAMBO)).toEqual(esperado);
    expect(interpretarEntrada('https://maps.google.com/?q=-12.7761%2C15.7392', HUAMBO)).toEqual(esperado);
    expect(interpretarEntrada('https://www.google.com/maps/@-12.7761,15.7392,17z', HUAMBO)).toEqual(esperado);
    expect(interpretarEntrada('geo:-12.7761,15.7392?z=17', HUAMBO)).toEqual(esperado);
    expect(interpretarEntrada('https://www.openstreetmap.org/?mlat=-12.7761&mlon=15.7392', HUAMBO)).toEqual(esperado);
  });

  test('outros links → link (não se abrem sozinhos)', () => {
    expect(interpretarEntrada('https://exemplo.ao/pagina?q=-12.7,15.7', HUAMBO)).toEqual({
      tipo: 'link',
      url: 'https://exemplo.ao/pagina?q=-12.7,15.7',
    });
  });

  test('código postal, ruas e bairros → servidor', () => {
    expect(interpretarEntrada('AO-HUA-MNFQR6JW-41', HUAMBO)).toEqual({ tipo: 'servidor', query: 'AO-HUA-MNFQR6JW-41' });
    expect(interpretarEntrada('  Rua da   Missão, 12 ', HUAMBO)).toEqual({ tipo: 'servidor', query: 'Rua da Missão, 12' });
  });

  test('vazio, curto e longo → mensagem', () => {
    expect(interpretarEntrada('  ', HUAMBO)).toEqual({ tipo: 'invalida', motivo: 'Escreve o que queres encontrar.' });
    expect(interpretarEntrada('ab', HUAMBO)).toEqual({ tipo: 'invalida', motivo: 'Escreve pelo menos 3 letras.' });
    expect(interpretarEntrada('x'.repeat(81), HUAMBO)).toEqual({ tipo: 'invalida', motivo: 'Escreve no máximo 80 letras.' });
  });
});

describe('lerResultados', () => {
  test('lê os resultados e ignora os estragados', () => {
    const r = lerResultados({
      resultados: [
        { tipo: 'morada', id: 'm1', titulo: 'AO-HUA-MNFQR6JW-41', subtitulo: 'Rua da Missão, nº 12', latitude: -12.77, longitude: 15.73, codigo_postal: 'AO-HUA-MNFQR6JW-41', plus_code: '6GXCQ6FM+2V' },
        { tipo: 'bairro', id: 'b1', titulo: 'Bairro Académico', subtitulo: 'Bairro', latitude: null, longitude: null },
        { tipo: 'outra', id: 'x', titulo: 'x' },
        { tipo: 'rua', id: '', titulo: 'sem id' },
        { tipo: 'rua', id: 'r1', titulo: 'Rua 0', latitude: 0, longitude: 0 },
      ],
    });
    expect(r).toEqual([
      { tipo: 'morada', id: 'm1', titulo: 'AO-HUA-MNFQR6JW-41', subtitulo: 'Rua da Missão, nº 12', latitude: -12.77, longitude: 15.73, codigoPostal: 'AO-HUA-MNFQR6JW-41', plusCode: '6GXCQ6FM+2V' },
      { tipo: 'bairro', id: 'b1', titulo: 'Bairro Académico', subtitulo: 'Bairro', latitude: null, longitude: null, codigoPostal: null, plusCode: null },
      { tipo: 'rua', id: 'r1', titulo: 'Rua 0', subtitulo: null, latitude: null, longitude: null, codigoPostal: null, plusCode: null },
    ]);
  });

  test('resposta sem lista → erro', () => {
    expect(() => lerResultados({ error: 'x' })).toThrow(/inesperada/);
    expect(() => lerResultados(null)).toThrow(/inesperada/);
  });
});
