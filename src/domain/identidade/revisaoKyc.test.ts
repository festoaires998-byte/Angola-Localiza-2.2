import { describe, expect, test } from '@jest/globals';

import { dataEnvio, erroMotivo, idCurto, lerPedidosKyc, MOTIVOS_RAPIDOS, podeReverKyc } from './revisaoKyc';

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
          { user_id: 'u1', submitted_at: '2026-09-24T10:00:00Z', front_url: 'https://x/f', back_url: 'https://x/v', selfie_url: 'https://x/s' },
          { user_id: 'u2', submitted_at: null, front_url: null, back_url: '', selfie_url: 'https://x/s2' },
          { submitted_at: '2026-09-24T10:00:00Z' },
          null,
        ],
      }),
    ).toEqual([
      { userId: 'u1', enviadoEm: '2026-09-24T10:00:00Z', frente: 'https://x/f', verso: 'https://x/v', selfie: 'https://x/s' },
      { userId: 'u2', enviadoEm: null, frente: null, verso: null, selfie: 'https://x/s2' },
    ]);
    expect(lerPedidosKyc({})).toEqual([]);
    expect(() => lerPedidosKyc({ error: 'apenas administradores' })).toThrow('apenas administradores');
  });

  test('recusar exige um motivo com 5 a 300 letras', () => {
    expect(erroMotivo('')).toMatch(/Escreve o motivo/);
    expect(erroMotivo('   ab  ')).toMatch(/Escreve o motivo/);
    expect(erroMotivo('BI desfocado')).toBeNull();
    expect(erroMotivo('x'.repeat(301))).toMatch(/demasiado longo/);
    for (const m of MOTIVOS_RAPIDOS) expect(erroMotivo(m)).toBeNull();
  });

  test('texto para mostrar', () => {
    expect(idCurto('3f1c2b7a-9d4e-4b8a-a1c2-0e9f8d7c6b5a')).toBe('3f1c2b7a');
    expect(dataEnvio(null)).toBe('data desconhecida');
    expect(dataEnvio('isto não é data')).toBe('data desconhecida');
    expect(dataEnvio(new Date(2026, 8, 24, 9, 5).toISOString())).toBe('24/09/2026 09:05');
  });
});
