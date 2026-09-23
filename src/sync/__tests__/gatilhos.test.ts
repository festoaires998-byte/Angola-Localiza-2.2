/**
 * @jest-environment node
 */
import { describe, expect, jest, test } from '@jest/globals';

jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('../motorSync', () => ({ sincronizar: jest.fn() }));
jest.mock('@/services/rede/conectividade', () => ({ estaOnline: jest.fn(), subscrever: jest.fn() }));

import { criarEmissor } from '../eventos';
import { ligarGatilhos, type FontesGatilhos } from '../gatilhos';

function fontes(online = true) {
  const avisos: {
    rede?: (online: boolean) => void;
    primeiroPlano?: () => void;
    sessao?: () => void;
  } = {};
  const desligados: string[] = [];
  let chamadas = 0;
  const f: FontesGatilhos = {
    sincronizar: () => {
      chamadas++;
      return Promise.resolve();
    },
    estaOnline: async () => online,
    ouvirRede: (m) => {
      avisos.rede = m;
      return () => desligados.push('rede');
    },
    ouvirPrimeiroPlano: (a) => {
      avisos.primeiroPlano = a;
      return () => desligados.push('primeiroPlano');
    },
    ouvirInicioSessao: (e) => {
      avisos.sessao = e;
      return () => desligados.push('sessao');
    },
    eventos: criarEmissor(),
  };
  return { f, avisos, desligados, chamadas: () => chamadas };
}

const esperar = () => new Promise((r) => setImmediate(r));

describe('gatilhos', () => {
  test('ligar não sincroniza sozinho', () => {
    const t = fontes();
    ligarGatilhos(t.f);
    expect(t.chamadas()).toBe(0);
  });

  test('sincroniza quando a rede volta (e não quando cai)', () => {
    const t = fontes();
    ligarGatilhos(t.f);
    t.avisos.rede!(false);
    expect(t.chamadas()).toBe(0);
    t.avisos.rede!(true);
    expect(t.chamadas()).toBe(1);
  });

  test('sincroniza ao voltar ao primeiro plano e ao iniciar sessão', () => {
    const t = fontes();
    ligarGatilhos(t.f);
    t.avisos.primeiroPlano!();
    t.avisos.sessao!();
    expect(t.chamadas()).toBe(2);
  });

  test('operação nova na fila: sincroniza só se houver rede', async () => {
    const comRede = fontes(true);
    ligarGatilhos(comRede.f);
    comRede.f.eventos.emitir('operacaoAcrescentada');
    await esperar();
    expect(comRede.chamadas()).toBe(1);

    const semRede = fontes(false);
    ligarGatilhos(semRede.f);
    semRede.f.eventos.emitir('operacaoAcrescentada');
    await esperar();
    expect(semRede.chamadas()).toBe(0);
  });

  test('desligar para de ouvir tudo', async () => {
    const t = fontes();
    const desligar = ligarGatilhos(t.f);
    desligar();
    expect(t.desligados.sort()).toEqual(['primeiroPlano', 'rede', 'sessao']);
    t.f.eventos.emitir('operacaoAcrescentada');
    await esperar();
    expect(t.chamadas()).toBe(0);
  });
});
