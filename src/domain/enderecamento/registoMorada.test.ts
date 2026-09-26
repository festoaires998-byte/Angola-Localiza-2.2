import { describe, expect, test } from '@jest/globals';

import type { Captura } from './capturaGps';
import { codificarGrelha, codigoPostalProvisorio, distanciaAoLimiteCelula, limitesCelula } from './codigoPostal';
import {
  codigosDasDuasCelulas,
  faltaParaEnviar,
  linhasMarcaDeAgua,
  minimoReferencia,
  montarPedidoRegisto,
  pontoAEnviar,
  pontoNaCelula,
  situacaoLimite,
  TIPO_OUTRO_MAX,
  tipoAEnviar,
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
    tipoOutro: '',
    ruaId: 'rua-1',
    ruaNome: '',
    ruaSemNome: false,
    bairro: 'Académico',
    bairroSemNome: false,
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

  test('campos obrigatórios: tipo, rua, bairro, referência, foto, duplicado confirmado', () => {
    const f = faltaParaEnviar(
      dados({ tipo: null, ruaId: null, ruaNome: '  ', bairro: ' ', referencia: 'x', foto: null, haDuplicado: true }),
    );
    expect(f).toHaveLength(6);
  });

  test('"Outro" exige a descrição do tipo; com ela, é a descrição que vai para o servidor', () => {
    const falta = 'Descrever o tipo de local (ex.: Padaria, Oficina).';
    expect(faltaParaEnviar(dados({ tipo: 'Outro', tipoOutro: '' }))).toEqual([falta]);
    expect(faltaParaEnviar(dados({ tipo: 'Outro', tipoOutro: '  a ' }))).toEqual([falta]);
    expect(() => montarPedidoRegisto(dados({ tipo: 'Outro', tipoOutro: ' ' }), 'd')).toThrow(falta);
    const p = montarPedidoRegisto(dados({ tipo: 'Outro', tipoOutro: '  Padaria   do  Zé ' }), 'd');
    expect(p.place_kind).toBe('Padaria do Zé');
    // A descrição só conta com "Outro": com outro tipo vai o tipo da lista.
    expect(montarPedidoRegisto(dados({ tipo: 'Loja', tipoOutro: 'Padaria' }), 'd').place_kind).toBe('Loja');
  });

  test('tipoAEnviar: tira [ ] (o servidor põe o tipo entre parênteses retos) e corta no máximo', () => {
    expect(tipoAEnviar('Outro', '[Oficina]')).toBe('Oficina');
    expect(tipoAEnviar('Outro', 'x'.repeat(60))).toHaveLength(TIPO_OUTRO_MAX);
    expect(tipoAEnviar('Escola', 'ignorado')).toBe('Escola');
  });

  test('rótulo territorial configurado: usa a gramática da localidade sem alterar o payload', () => {
    expect(faltaParaEnviar(dados({ bairro: '' }), 'localidade')).toEqual([
      'Escolher a localidade, escrever o nome dela ou marcar "Esta localidade não tem nome".',
    ]);
    expect(faltaParaEnviar(dados({ bairro: '', bairroSemNome: true }), 'localidade')).not.toContain(
      'Escolher a localidade, escrever o nome dela ou marcar "Esta localidade não tem nome".',
    );
  });

  test('bairro obrigatório: sem ele o botão não ativa, com a frase certa', () => {
    expect(faltaParaEnviar(dados({ bairro: '' }))).toEqual(['Escolher o bairro, escrever o nome dele ou marcar "Este bairro não tem nome".']);
    expect(faltaParaEnviar(dados({ bairro: '  ' }))).toEqual(['Escolher o bairro, escrever o nome dele ou marcar "Este bairro não tem nome".']);
    expect(() => montarPedidoRegisto(dados({ bairro: '' }), 'd')).toThrow('Escolher o bairro, escrever o nome dele ou marcar "Este bairro não tem nome".');
    expect(faltaParaEnviar(dados({ bairro: 'Bairro Académico' }))).toEqual([]);
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
      neighborhood_name: 'Académico',
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

test('marca de água igual à dos técnicos de campo: 📍 Plus Code · latitude, longitude (5 casas) e data/hora', () => {
  expect(linhasMarcaDeAgua('5FVQ6PFQ+HJ9', -12.776104, 15.739249, new Date(2026, 8, 24, 9, 5, 7))).toEqual([
    '📍 5FVQ6PFQ+HJ9 · -12.77610, 15.73925',
    '24/09/2026 09:05:07',
  ]);
});

describe('posição a enviar (e a usar para pedir ruas e bairros)', () => {
  test('longe do limite: a medida; junto ao limite sem escolha: a medida', () => {
    expect(pontoAEnviar(captura(CENTRO), null)).toEqual(CENTRO);
    expect(pontoAEnviar(captura(CENTRO), 'vizinha')).toEqual(CENTRO);
    expect(pontoAEnviar(captura(JUNTO), null)).toEqual(JUNTO);
  });

  test('junto ao limite com escolha: 1 m dentro da célula escolhida — a mesma posição que vai no pedido', () => {
    for (const escolha of ['esta', 'vizinha'] as const) {
      const p = pontoAEnviar(captura(JUNTO), escolha);
      const esperado = pontoNaCelula(JUNTO.latitude, JUNTO.longitude, escolha);
      expect(p).toEqual({ latitude: esperado.latitude, longitude: esperado.longitude });
      const pedido = montarPedidoRegisto(dados({ captura: captura(JUNTO), escolhaCelula: escolha }), 'd');
      expect({ latitude: pedido.latitude, longitude: pedido.longitude }).toEqual(p);
    }
    // A vizinha fica noutra célula (a norte).
    expect(pontoAEnviar(captura(JUNTO), 'vizinha').latitude).toBeGreaterThan(c.latMax);
  });
});

describe('rua e bairro sem nome', () => {
  const semNomes = { ruaId: null, ruaNome: '', ruaSemNome: true, bairro: '', bairroSemNome: true, referencia: 'Portão azul, ao lado da igreja' };

  test('não bloqueiam o envio (a referência passa a ser a pista principal)', () => {
    expect(faltaParaEnviar(dados(semNomes))).toEqual([]);
  });

  test('sem nome de rua ou de bairro, a referência tem de ter pelo menos 10 letras', () => {
    expect(minimoReferencia(dados())).toBe(3);
    expect(minimoReferencia(dados({ ruaId: null, ruaSemNome: true }))).toBe(10);
    expect(minimoReferencia(dados({ bairroSemNome: true }))).toBe(10);
    // Rua escolhida da lista: o "sem nome" da rua não conta.
    expect(minimoReferencia(dados({ ruaId: 'rua-1', ruaSemNome: true }))).toBe(3);
    expect(faltaParaEnviar(dados({ ...semNomes, referencia: 'Azul' }))).toEqual([
      'Sem nome de rua ou de bairro, a referência guia quem procura: escreve pelo menos 10 letras (ex.: portão azul, ao lado da igreja).',
    ]);
  });

  test('payload: new_unnamed_street (sem nome de rua inventado) e neighborhood_name null', () => {
    const p = montarPedidoRegisto(dados(semNomes), 'disp-1');
    expect(p.new_unnamed_street).toBe(true);
    expect(p).not.toHaveProperty('street_name');
    expect(p).not.toHaveProperty('street_id');
    expect(p.neighborhood_name).toBeNull();
    expect(p.reference).toBe('Portão azul, ao lado da igreja');
  });

  test('só a rua sem nome: o bairro vai; só o bairro sem nome: a rua vai', () => {
    expect(montarPedidoRegisto(dados({ ruaId: null, ruaSemNome: true, referencia: 'Portão azul, ao lado da igreja' }), 'd')).toMatchObject({
      new_unnamed_street: true,
      neighborhood_name: 'Académico',
    });
    const soBairro = montarPedidoRegisto(dados({ bairro: '', bairroSemNome: true, referencia: 'Portão azul, ao lado da igreja' }), 'd');
    expect(soBairro).toMatchObject({ street_id: 'rua-1', neighborhood_name: null });
    expect(soBairro).not.toHaveProperty('new_unnamed_street');
  });

  test('sem rua nenhuma (nem nome, nem lista, nem "sem nome") continua a faltar', () => {
    expect(faltaParaEnviar(dados({ ruaId: null, ruaNome: '', ruaSemNome: false }))).toEqual([
      'Escolher a rua, escrever o nome dela ou marcar "Esta rua não tem nome".',
    ]);
  });
});
