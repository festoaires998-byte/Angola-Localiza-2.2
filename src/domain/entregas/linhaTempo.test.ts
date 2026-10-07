import { describe, expect, test } from '@jest/globals';

import { indicePasso, passosEntrega } from './linhaTempo';

const estados = (e: string | null) => passosEntrega(e).map((p) => p.estado);

describe('linha do tempo da entrega', () => {
  test('cada estado do servidor cai no passo certo', () => {
    expect(indicePasso('CREATED')).toBe(0);
    expect(indicePasso('ASSIGNED')).toBe(1);
    expect(indicePasso('PICKED_UP')).toBe(2);
    expect(indicePasso('IN_TRANSIT')).toBe(3);
    expect(indicePasso('OUT_FOR_DELIVERY')).toBe(3);
    expect(indicePasso('DELIVERED')).toBe(4);
    expect(indicePasso('???')).toBe(-1);
  });

  test('o passo atual fica destacado; os anteriores feitos; os seguintes por fazer', () => {
    expect(estados('CREATED')).toEqual(['agora', 'depois', 'depois', 'depois', 'depois']);
    expect(estados('PICKED_UP')).toEqual(['feito', 'feito', 'agora', 'depois', 'depois']);
    expect(passosEntrega('IN_TRANSIT')[3]).toEqual({ nome: 'A caminho', detalhe: 'A caminho do destino', estado: 'agora' });
  });

  test('entregue: tudo feito', () => {
    expect(estados('DELIVERED')).toEqual(['feito', 'feito', 'feito', 'feito', 'feito']);
    expect(passosEntrega('DELIVERED')[4].detalhe).toBe('Confirmada com o PIN de quem recebe');
  });

  test('falhou: fica no "A caminho" a vermelho, com a explicação', () => {
    expect(estados('FAILED')).toEqual(['feito', 'feito', 'feito', 'falhou', 'depois']);
    expect(passosEntrega('FAILED')[3]).toMatchObject({ nome: 'Não foi possível entregar', detalhe: 'Vai ser tentada de novo' });
  });

  test('cancelada: só o pedido e o cancelamento', () => {
    expect(passosEntrega('CANCELLED').map((p) => p.nome)).toEqual(['Pedido criado', 'Cancelada']);
    expect(estados('CANCELLED')).toEqual(['feito', 'cancelado']);
  });

  test('estado desconhecido não rebenta: começa no primeiro passo', () => {
    expect(estados(null)[0]).toBe('agora');
  });
});
