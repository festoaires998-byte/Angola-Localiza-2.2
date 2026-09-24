import { describe, expect, test } from '@jest/globals';

import { aprovadosPorJuntar, categoriaDoTipo, lerRegistos, nomeEstadoRegisto, registoDaFila, separarTipo } from './meusRegistos';

describe('os meus registos: regras', () => {
  test('separa o tipo de local do resto da referência', () => {
    expect(separarTipo('[Casa] Portão Castanho, ao lado da igreja')).toEqual({ tipo: 'Casa', texto: 'Portão Castanho, ao lado da igreja' });
    expect(separarTipo('Sem tipo')).toEqual({ tipo: null, texto: 'Sem tipo' });
  });

  test('categoria do favorito a partir do tipo (com ou sem acentos)', () => {
    expect(categoriaDoTipo('Casa')).toBe('casa');
    expect(categoriaDoTipo('Escritório')).toBe('trabalho');
    expect(categoriaDoTipo('Loja')).toBe('loja');
    expect(categoriaDoTipo('Padaria')).toBe('outro');
    expect(categoriaDoTipo(null)).toBe('outro');
  });

  test('lê os registos do servidor com o código postal e o número das aprovadas', () => {
    const registos = lerRegistos(
      [
        { id: 'r1', status: 'PENDING_REVIEW', reference: '[Casa] Portão Castanho', neighborhood_name: 'São Luís', collected_at: '2026-09-24T12:25:05Z', resulting_address_id: null },
        { id: 'r2', status: 'APPROVED', reference: '[Loja] Ao lado do mercado', collected_at: '2026-09-23T10:00:00Z', validated_at: '2026-09-24T10:00:00Z', resulting_address_id: 'm2' },
        { id: 'r3', status: 'REJECTED', reference: 'x' },
        { id: 'r4', status: 'DUPLICATE', reference: 'y' },
        { status: 'APPROVED' },
      ],
      new Map([['m2', { codigoPostal: 'AO-HUA-23456789-42', numeroPorta: '12' }]]),
    );
    expect(registos.map((r) => r.estado)).toEqual(['por_validar', 'aprovado', 'rejeitado', 'duplicado']);
    expect(registos[0]).toMatchObject({ tipo: 'Casa', referencia: 'Portão Castanho', bairro: 'São Luís', moradaId: null });
    expect(registos[1]).toMatchObject({ tipo: 'Loja', moradaId: 'm2', codigoPostal: 'AO-HUA-23456789-42', numeroPorta: '12' });
    expect(() => lerRegistos(null, new Map())).toThrow();
  });

  test('registo ainda na fila (field_submit) fica "à espera de rede"', () => {
    const r = registoDaFila('op-1', { reference: '[Casa] Portão azul', neighborhood_name: 'Cidade Baixa' }, '2026-09-24T12:00:00Z');
    expect(r).toMatchObject({ id: 'op-1', estado: 'a_espera_rede', tipo: 'Casa', referencia: 'Portão azul', bairro: 'Cidade Baixa' });
    expect(nomeEstadoRegisto(r)).toBe('À espera de rede para ser enviado');
  });

  test('estados em palavras simples', () => {
    const base = registoDaFila('x', {}, '2026-09-24T12:00:00Z');
    expect(nomeEstadoRegisto({ ...base, estado: 'por_validar' })).toBe('À espera de validação');
    expect(nomeEstadoRegisto({ ...base, estado: 'aprovado', codigoPostal: 'AO-1', numeroPorta: '3' })).toBe('Aprovado · AO-1 · nº 3');
    expect(nomeEstadoRegisto({ ...base, estado: 'aprovado' })).toBe('Aprovado');
    expect(nomeEstadoRegisto({ ...base, estado: 'duplicado' })).toBe('Já existia uma morada neste sítio');
  });

  test('só os aprovados com morada e ainda não juntados vão para os favoritos', () => {
    const base = registoDaFila('x', {}, '2026-09-24T12:00:00Z');
    const lista = [
      { ...base, id: 'a', estado: 'aprovado' as const, moradaId: 'm1' },
      { ...base, id: 'b', estado: 'aprovado' as const, moradaId: 'm2' },
      { ...base, id: 'c', estado: 'por_validar' as const, moradaId: null },
    ];
    expect(aprovadosPorJuntar(lista, new Set(['m1'])).map((r) => r.id)).toEqual(['b']);
  });
});
