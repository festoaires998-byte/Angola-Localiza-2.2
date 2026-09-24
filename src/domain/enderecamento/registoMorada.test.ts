import { describe, expect, test } from '@jest/globals';

import type { Captura } from './capturaGps';
import { codificarGrelha, codigoPostalProvisorio, distanciaAoLimiteCelula, limitesCelula } from './codigoPostal';
import {
  codigosDasDuasCelulas,
  faltaParaEnviar,
  linhasMarcaDeAgua,
  montarPedidoRegisto,
  pontoNaCelula,
  situacaoLimite,
  type DadosRegisto,
} from './registoMorada';

const M = 1 / 110_574;
const c = limitesCelula(-12.7761, 15.7392);
const meioLng = (c.lngMin + c.lngMax) / 2;
/** A 2 m do limite norte da célula MNFQR6JW. */
const JUNTO = { latitude: c.latMax - 2 * M, longitude: meioLng };
/** No centro da célula (~9,5 m de cada limite norte/sul). */
const CENTRO = { latitude: (c.latMin + c.latMax) / 2, longitude: meioLng };

function captura(p: { latitude: number; longitude: number }, precisao = 4, fraca = false): Captura {
  return { ...p, precisao, leituras: 5, fraca };
}

function dados(extra: Partial<DadosRegisto> = {}): DadosRegisto {
  return {
    captura: captura(CENTRO),
    escolhaCelula: null,
    tipo: 'Casa',
    ruaId: 'rua-1',
    ruaNome: '',
    referencia: 'Portão azul',
    foto: 'offline:foto-1',
    duplicadoConfirmado: false,
    haDuplicado: false,
    ...extra,
  };
}

describe('limite das células', () => {
  test('a 2 m do limite norte: junto, do lado norte', () => {
    const s = situacaoLimite(JUNTO.latitude, JUNTO.longitude);
    expect(s.lado).toBe('norte');
    expect(s.distanciaM).toBeCloseTo(2, 1);
    expect(s.junto).toBe(true);
  });

  test('no centro: longe do limite', () => {
    expect(situacaoLimite(CENTRO.latitude, CENTRO.longitude).junto).toBe(false);
  });

  test('a 7 m do limite: longe com boa precisão, junto se a precisão for pior que a distância', () => {
    const p = { latitude: c.latMax - 7 * M, longitude: meioLng };
    expect(situacaoLimite(p.latitude, p.longitude, 4).junto).toBe(false);
    expect(situacaoLimite(p.latitude, p.longitude, 9).junto).toBe(true);
  });

  test('escolher esta célula: a posição fica 1 m dentro dela (e o código não muda)', () => {
    const r = pontoNaCelula(JUNTO.latitude, JUNTO.longitude, 'esta');
    expect(codificarGrelha(r.latitude, r.longitude)).toBe(codificarGrelha(JUNTO.latitude, JUNTO.longitude));
    // Já estava a 2 m (> 1 m) do limite: não se mexe.
    expect(r.deslocamentoM).toBeCloseTo(0, 5);
    // A 0,3 m do limite: puxa para 1 m dentro.
    const quase = pontoNaCelula(c.latMax - 0.3 * M, meioLng, 'esta');
    expect(quase.deslocamentoM).toBeCloseTo(0.7, 1);
    expect(distanciaAoLimiteCelula(quase.latitude, quase.longitude)).toBeCloseTo(1, 1);
  });

  test('escolher a vizinha: passa para a célula do lado, 1 m dentro, e anda ~3 m', () => {
    const r = pontoNaCelula(JUNTO.latitude, JUNTO.longitude, 'vizinha');
    expect(codificarGrelha(r.latitude, r.longitude)).not.toBe(codificarGrelha(JUNTO.latitude, JUNTO.longitude));
    expect(r.deslocamentoM).toBeCloseTo(3, 1);
    expect(r.longitude).toBe(JUNTO.longitude);
  });

  test('também funciona para os limites este/oeste', () => {
    const mLng = 1 / (111_320 * Math.cos((c.latMax * Math.PI) / 180));
    const junto = { latitude: (c.latMin + c.latMax) / 2, longitude: c.lngMin + 1.5 * mLng };
    expect(situacaoLimite(junto.latitude, junto.longitude).lado).toBe('oeste');
    const r = pontoNaCelula(junto.latitude, junto.longitude, 'vizinha');
    expect(r.latitude).toBe(junto.latitude);
    expect(r.longitude).toBeLessThan(c.lngMin);
    expect(r.deslocamentoM).toBeCloseTo(2.5, 1);
  });

  test('os dois códigos para escolher são os das duas células', () => {
    const cod = codigosDasDuasCelulas(JUNTO.latitude, JUNTO.longitude, 'Huambo');
    expect(cod.esta).toBe(codigoPostalProvisorio(JUNTO.latitude, JUNTO.longitude, 'Huambo').codigo);
    expect(cod.vizinha).not.toBe(cod.esta);
    expect(cod.vizinha).toMatch(/^AO-HUA-[2-9A-HJ-NP-Z]{8}-\d{2}$/);
  });
});

describe('o que falta para enviar', () => {
  test('tudo preenchido, longe do limite: pode enviar', () => {
    expect(faltaParaEnviar(dados())).toEqual([]);
  });

  test('sem posição, ou com precisão pior que 10 m: não envia', () => {
    expect(faltaParaEnviar(dados({ captura: null }))[0]).toMatch(/medição/);
    expect(faltaParaEnviar(dados({ captura: captura(CENTRO, 15, true) }))[0]).toMatch(/±10 m/);
  });

  test('junto ao limite: só envia depois de escolher a célula (nunca "à sorte")', () => {
    const junto = dados({ captura: captura(JUNTO) });
    expect(faltaParaEnviar(junto)).toEqual([
      'Junto ao limite de duas células: mede no centro da entrada ou escolhe a célula.',
    ]);
    expect(() => montarPedidoRegisto(junto, 'dispositivo-1')).toThrow(/limite/);
    expect(faltaParaEnviar({ ...junto, escolhaCelula: 'vizinha' })).toEqual([]);
  });

  test('campos obrigatórios: tipo, rua, referência, foto, duplicado confirmado', () => {
    const f = faltaParaEnviar(
      dados({ tipo: null, ruaId: null, ruaNome: '  ', referencia: 'x', foto: null, haDuplicado: true }),
    );
    expect(f).toHaveLength(5);
  });
});

describe('pedido para o servidor', () => {
  test('longe do limite: envia a posição medida, sem mexer', () => {
    const p = montarPedidoRegisto(dados(), 'dispositivo-1');
    expect(p).toEqual({
      device_id: 'dispositivo-1',
      latitude: CENTRO.latitude,
      longitude: CENTRO.longitude,
      photo_facade_url: 'offline:foto-1',
      reference: 'Portão azul',
      place_kind: 'Casa',
      street_id: 'rua-1',
      accuracy_meters: 4,
      override_duplicate: false,
      duplicate_justification: null,
      watermark_match: null,
    });
  });

  test('junto ao limite com a vizinha escolhida: o servidor vai calcular o código da vizinha', () => {
    const p = montarPedidoRegisto(dados({ captura: captura(JUNTO), escolhaCelula: 'vizinha' }), 'd');
    const escolhido = codigosDasDuasCelulas(JUNTO.latitude, JUNTO.longitude, 'Huambo').vizinha;
    expect(codigoPostalProvisorio(p.latitude, p.longitude, 'Huambo').codigo).toBe(escolhido);
  });

  test('rua nova e duplicado confirmado', () => {
    const p = montarPedidoRegisto(
      dados({ ruaId: null, ruaNome: ' Rua da Missão ', haDuplicado: true, duplicadoConfirmado: true }),
      'd',
    );
    expect(p.street_name).toBe('Rua da Missão');
    expect(p).not.toHaveProperty('street_id');
    expect(p.override_duplicate).toBe(true);
    expect(p.duplicate_justification).toMatch(/local diferente/);
  });
});

test('marca de água: Plus Code e data/hora', () => {
  expect(linhasMarcaDeAgua('5FVQ6PFQ+HJ9', new Date(2026, 8, 24, 9, 5, 7))).toEqual([
    'Plus Code 5FVQ6PFQ+HJ9',
    '24/09/2026 09:05:07',
  ]);
});
