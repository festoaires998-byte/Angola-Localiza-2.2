/**
 * @jest-environment node
 */
// A Edge Function "public-api" (v9) a correr de verdade, com um Supabase falso.
// As organizações (chave da API) nunca veem moradas privadas ou por validar,
// nem entregas que não pagam.
import { describe, expect, jest, test } from '@jest/globals';
import { createHash } from 'crypto';

import { entregaDaOrganizacao, escaparIlike, moradaPublica } from '../../supabase/functions/public-api/regras';
import { carregarFuncao, criarSupabaseFalso, URL_SUPABASE_FALSO } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/public-api/index.ts');
  });
});

const CHAVE = 'chave-da-organizacao';
const ORG = 'org-1';

const morada = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  postal_code: `AO-HUA-${id.toUpperCase()}`,
  plus_code: `PC-${id}`,
  latitude: -12.77,
  longitude: 15.73,
  status: 'APPROVED',
  visibility_level: 'PUBLIC',
  reference: '[Farmacia] Ao lado do mercado',
  street_id: 'rua-1',
  house_number: '12',
  ...extra,
});

function cenario() {
  const s = criarSupabaseFalso({
    tabelas: {
      api_keys: [{
        id: 'k1', key_hash: createHash('sha256').update(CHAVE).digest('hex'), revoked: false, organization_id: ORG,
        window_started_at: new Date().toISOString(), requests_this_window: 0, rate_limit_per_minute: 1000,
      }],
      addresses: [
        morada('publica'),
        morada('privada', { visibility_level: 'PRIVATE' }),
        morada('porvalidar', { status: 'PROPOSED' }),
      ],
      streets: [{ id: 'rua-1', nome_normalizado: 'rua da missao' }],
      deliveries: [
        { id: 'd1', tracking_code: 'RAST-ORG', status: 'CREATED', recipient_name: 'Ana', payer_organization_id: ORG },
        { id: 'd2', tracking_code: 'RAST-CIDADAO', status: 'CREATED', recipient_name: 'Bento', payer_organization_id: null },
        { id: 'd3', tracking_code: 'RAST-OUTRA', status: 'CREATED', recipient_name: 'Carla', payer_organization_id: 'org-2' },
      ],
    },
    rpc: {
      // Devolve a morada cujo id está no "in_lat" (atalho do teste).
      nearby_for_duplicates: (args: { in_lat: number }) => [{ source: 'address', id: (globalThis as any).__perto }],
    },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown) {
  const res = await handler(
    new Request(`${URL_SUPABASE_FALSO}/functions/v1/public-api${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'x-api-key': CHAVE },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe('public-api v9: privacidade das moradas', () => {
  test('verify por coordenadas: só devolve moradas validadas e não privadas', async () => {
    cenario();
    for (const [id, valida] of [['publica', true], ['privada', false], ['porvalidar', false]] as const) {
      (globalThis as any).__perto = id;
      const r = await chamar('POST', '/v1/address/verify', { latitude: -12.77, longitude: 15.73 });
      expect(r.json.valid).toBe(valida);
      expect(r.json.address === null).toBe(!valida);
    }
  });

  test('verify, GET e get_address por código postal: a privada não aparece', async () => {
    cenario();
    expect((await chamar('POST', '/v1/address/verify', { postal_code: 'AO-HUA-PUBLICA' })).json.valid).toBe(true);
    expect((await chamar('POST', '/v1/address/verify', { postal_code: 'AO-HUA-PRIVADA' })).json).toEqual({ valid: false, address: null });
    expect((await chamar('GET', '/v1/address/AO-HUA-PRIVADA')).json).toEqual({ found: false, address: null });
    expect((await chamar('POST', '?action=get_address', { postal_code: 'AO-HUA-PRIVADA' })).json).toEqual({ found: false, address: null });
    expect((await chamar('GET', '/v1/address/AO-HUA-PUBLICA')).json.found).toBe(true);
  });

  test('reverse: a privada não aparece', async () => {
    cenario();
    (globalThis as any).__perto = 'privada';
    expect((await chamar('POST', '/v1/address/reverse', { latitude: -12.77, longitude: 15.73 })).json).toEqual({ found: false, address: null });
  });

  test('search: tira as privadas e as por validar', async () => {
    cenario();
    const r = await chamar('POST', '/v1/address/search', { place_kind: 'Farmacia' });
    expect(r.json.results.map((a: { postal_code: string }) => a.postal_code)).toEqual(['AO-HUA-PUBLICA']);
  });

  test('delivery/create: recusa a morada privada (404) e aceita a pública', async () => {
    const s = cenario();
    expect((await chamar('POST', '/v1/delivery/create', { postal_code: 'AO-HUA-PRIVADA', recipient_name: 'Ana' })).status).toBe(404);
    expect(s.tabelas().deliveries).toHaveLength(3);
    expect((await chamar('POST', '/v1/delivery/create', { postal_code: 'AO-HUA-PUBLICA', recipient_name: 'Ana' })).status).toBe(200);
  });
});

describe('public-api v9: entregas', () => {
  test('só as entregas que a organização paga (antes, as dos cidadãos mostravam o nome de quem recebe)', async () => {
    cenario();
    expect((await chamar('GET', '/v1/delivery/RAST-ORG')).json).toMatchObject({ found: true, delivery: { recipient_name: 'Ana' } });
    expect((await chamar('GET', '/v1/delivery/RAST-CIDADAO')).status).toBe(403);
    expect((await chamar('GET', '/v1/delivery/RAST-OUTRA')).status).toBe(403);
  });
});

describe('public-api v9: regras puras', () => {
  test('moradaPublica, escaparIlike e entregaDaOrganizacao', () => {
    expect(moradaPublica({ status: 'OFFICIAL', visibility_level: null })).toBe(true);
    expect(moradaPublica({ status: 'APPROVED', visibility_level: 'LIMITED' })).toBe(true);
    expect(moradaPublica({ status: 'APPROVED', visibility_level: 'PRIVATE' })).toBe(false);
    expect(moradaPublica({ status: 'PROPOSED', visibility_level: 'PUBLIC' })).toBe(false);
    expect(moradaPublica(null)).toBe(false);
    expect(escaparIlike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(entregaDaOrganizacao({ payer_organization_id: null }, ORG)).toBe(false);
    expect(entregaDaOrganizacao({ payer_organization_id: ORG }, null)).toBe(false);
    expect(entregaDaOrganizacao({ payer_organization_id: ORG }, ORG)).toBe(true);
  });
});
