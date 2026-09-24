import { describe, expect, test } from '@jest/globals';

import { dataEnvio, detalhesDoPedido, erroMotivo, idCurto, lerFotosKyc, lerPedidosKyc, MOTIVOS_RAPIDOS, nomeDoPedido, podeReverKyc } from './revisaoKyc';

describe('revisão das verificações (regras)', () => {
  test('só os cargos que o servidor aceita (is_admin) podem rever; o auditor não', () => {
    for (const c of ['super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal']) expect(podeReverKyc([c])).toBe(true);
    for (const c of ['auditor', 'supervisor', 'tecnico_campo', 'estafeta', 'qualquer']) expect(podeReverKyc([c])).toBe(false);
    expect(podeReverKyc(['auditor', 'admin_municipal'])).toBe(true);
    expect(podeReverKyc([])).toBe(false);
    expect(podeReverKyc(null)).toBe(false);
  });

  test('lê a lista do servidor (ignora linhas sem user_id; fotos em falta ficam null)', () => {
    expect(
      lerPedidosKyc({
        pending: [
          {
            user_id: 'u1',
            submitted_at: '2026-09-24T10:00:00Z',
            email: 'ana@exemplo.ao',
            name: 'Ana Silva',
            phone: '+244923000000',
            front_url: 'https://x/f',
            back_url: 'https://x/v',
            selfie_url: 'https://x/s',
          },
          { user_id: 'u2', submitted_at: null, front_url: null, back_url: '', selfie_url: 'https://x/s2' },
          { submitted_at: '2026-09-24T10:00:00Z' },
          null,
        ],
      }),
    ).toEqual([
      {
        userId: 'u1',
        enviadoEm: '2026-09-24T10:00:00Z',
        email: 'ana@exemplo.ao',
        nome: 'Ana Silva',
        telefone: '+244923000000',
      },
      { userId: 'u2', enviadoEm: null, email: null, nome: null, telefone: null },
    ]);
    expect(lerPedidosKyc({})).toEqual([]);
    expect(() => lerPedidosKyc({ error: 'apenas administradores' })).toThrow('apenas administradores');
  });

  test('lê a resposta de view (links das 3 fotos; em falta → null)', () => {
    expect(lerFotosKyc({ front_url: 'https://x/f', back_url: '', selfie_url: 'https://x/s', expires_in: 600 })).toEqual({
      frente: 'https://x/f',
      verso: null,
      selfie: 'https://x/s',
    });
    expect(() => lerFotosKyc({ error: 'nao podes abrir a tua propria verificacao' })).toThrow('propria');
  });

  test('recusar exige um motivo com 5 a 300 letras', () => {
    expect(erroMotivo('')).toMatch(/Escreve o motivo/);
    expect(erroMotivo('   ab  ')).toMatch(/Escreve o motivo/);
    expect(erroMotivo('BI desfocado')).toBeNull();
    expect(erroMotivo('x'.repeat(301))).toMatch(/demasiado longo/);
    for (const m of MOTIVOS_RAPIDOS) expect(erroMotivo(m)).toBeNull();
  });

  test('quem é: nome, senão email, senão id curto; os detalhes não repetem o título', () => {
    const id = '3f1c2b7a-9d4e-4b8a-a1c2-0e9f8d7c6b5a';
    const completo = { userId: id, nome: 'Ana Silva', email: 'ana@exemplo.ao', telefone: '+244923000000' };
    expect(nomeDoPedido(completo)).toBe('Ana Silva');
    expect(detalhesDoPedido(completo)).toEqual(['Email: ana@exemplo.ao', 'Telefone: +244923000000', 'Id: 3f1c2b7a']);
    const soEmail = { userId: id, nome: null, email: 'ana@exemplo.ao', telefone: null };
    expect(nomeDoPedido(soEmail)).toBe('ana@exemplo.ao');
    expect(detalhesDoPedido(soEmail)).toEqual(['Id: 3f1c2b7a']);
    const nada = { userId: id, nome: null, email: null, telefone: null };
    expect(nomeDoPedido(nada)).toBe('Cidadão 3f1c2b7a');
    expect(detalhesDoPedido(nada)).toEqual([]);
  });

  test('texto para mostrar', () => {
    expect(idCurto('3f1c2b7a-9d4e-4b8a-a1c2-0e9f8d7c6b5a')).toBe('3f1c2b7a');
    expect(dataEnvio(null)).toBe('data desconhecida');
    expect(dataEnvio('isto não é data')).toBe('data desconhecida');
    expect(dataEnvio(new Date(2026, 8, 24, 9, 5).toISOString())).toBe('24/09/2026 09:05');
  });
});
