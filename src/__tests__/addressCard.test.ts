/**
 * @jest-environment node
 */
// A Edge Function "address-card" (v9): o cartão partilhado serve de destino de uma entrega.
import { describe, expect, jest, test } from '@jest/globals';

import { carregarFuncao, criarSupabaseFalso, pedir } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/address-card/index.ts');
  });
});

const DONO = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002';
const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';

function cenario(visibilidade: string) {
  const s = criarSupabaseFalso({
    sessoes: { dono: DONO, outro: OUTRO },
    tabelas: {
      address_cards: [{ id: 'card-1', address_id: MORADA, recipient_name: 'Ana', recipient_phone: '+244923000000', note: null }],
      addresses: [{ id: MORADA, postal_code: 'AO-HUA-XXXXXXXX-11', status: 'APPROVED', visibility_level: visibilidade, created_by: DONO, latitude: -12.7, longitude: 15.7 }],
    },
    rpc: { is_admin: () => false },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

describe('address-card v9', () => {
  test('get devolve o id da morada (para ser destino de uma entrega), sem dono nem visibilidade', async () => {
    cenario('PUBLIC');
    const r = await pedir(handler, 'get', { card_id: 'card-1' }, 'outro');
    expect(r.status).toBe(200);
    expect(r.json.address).toMatchObject({ id: MORADA, postal_code: 'AO-HUA-XXXXXXXX-11' });
    expect(r.json.address).not.toHaveProperty('created_by');
    expect(r.json.address).not.toHaveProperty('visibility_level');
  });

  test('morada privada: só o dono vê o cartão', async () => {
    cenario('PRIVATE');
    expect((await pedir(handler, 'get', { card_id: 'card-1' }, 'outro')).status).toBe(403);
    expect((await pedir(handler, 'get', { card_id: 'card-1' }, 'dono')).status).toBe(200);
  });

  test('criar um cartão exige sessão', async () => {
    cenario('PUBLIC');
    expect((await pedir(handler, 'create', { address_id: MORADA }, null)).status).toBe(401);
    expect((await pedir(handler, 'create', { address_id: MORADA }, 'dono')).status).toBe(200);
  });
});
