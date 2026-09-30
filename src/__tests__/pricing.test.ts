/**
 * @jest-environment node
 */
// A Edge Function "pricing" (v5) a correr de verdade, com um Supabase falso.
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  aplicarDesconto,
  aplicarSobretaxaHorario,
  determinarZona,
  escolherZona,
  horaLocal,
} from '../../supabase/functions/pricing/precos';
import { carregarFuncao, criarSupabaseFalso, pedir } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/pricing/index.ts');
  });
});

const SUPER = 'aaaaaaaa-0000-4000-8000-000000000001';
const CIDADAO = 'aaaaaaaa-0000-4000-8000-000000000002';
const ORG = 'dddddddd-0000-4000-8000-000000000001';
const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';
const MUN = 'eeeeeeee-0000-4000-8000-000000000001';
const MUN2 = 'eeeeeeee-0000-4000-8000-000000000002';
const PROV = 'ffffffff-0000-4000-8000-000000000001';

const zona = (z: string, base: number) => ({
  country_code: 'AO', zone_code: z, currency_code: 'AOA', base_fee: base, routing_fee: 500, proof_fee: 200, bulky_fee: 500, long_wait_fee: 300,
});

function cenario() {
  const s = criarSupabaseFalso({
    sessoes: { super: SUPER, cidadao: CIDADAO },
    tabelas: {
      country_pricing_zones: [zona('A', 1500), zona('B', 2500), zona('C', 4000)],
      pricing_zones: [{ zone_code: 'A', base_fee: 1500, routing_fee: 500, proof_fee: 200 }],
      organization_members: [{ user_id: SUPER, role: 'super_admin', organization_id: ORG }],
      organization_pricing_overrides: [{ organization_id: ORG, zone_code: 'A', base_fee: 1000 }],
      addresses: [{ id: MORADA, municipality_id: MUN, province_id: PROV }],
      deliveries: [],
    },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

// Terça-feira 29/09/2026, 10h UTC = 11h em Angola: sem sobretaxa.
const DIA = '2026-09-29T10:00:00Z';

afterEach(() => {
  jest.useRealTimers();
});

describe('pricing: regras puras', () => {
  test('a cópia na deliveries é igual à da pricing', () => {
    const raiz = join(__dirname, '../../supabase/functions');
    expect(readFileSync(join(raiz, 'deliveries/precos.ts'), 'utf8')).toBe(readFileSync(join(raiz, 'pricing/precos.ts'), 'utf8'));
  });

  test('zona: mesmo município A, mesma província C, resto B', () => {
    expect(determinarZona({ municipality_id: MUN, province_id: PROV }, { municipality_id: MUN, province_id: PROV })).toBe('A');
    expect(determinarZona({ municipality_id: MUN2, province_id: PROV }, { municipality_id: MUN, province_id: PROV })).toBe('C');
    expect(determinarZona(null, { municipality_id: MUN, province_id: PROV })).toBe('B');
    expect(escolherZona({ zone_code_hint: 'c' }, null, null)).toEqual({ zona: 'C', estimada: false });
    expect(escolherZona({ zone_code: 'Z9' }, null, null)).toEqual({ zona: 'B', estimada: true });
  });

  test('sobretaxa na hora do país (Angola UTC+1; Moçambique UTC+2)', () => {
    expect(horaLocal(new Date('2026-09-29T19:30:00Z'), 'AO').hora).toBe(20);
    expect(aplicarSobretaxaHorario(1000, new Date('2026-09-29T19:30:00Z'), 'AO')).toEqual({ total: 1200, surcharge: 200 });
    expect(aplicarSobretaxaHorario(1000, new Date('2026-09-29T18:30:00Z'), 'AO')).toEqual({ total: 1000, surcharge: 0 });
    expect(aplicarSobretaxaHorario(1000, new Date('2026-09-29T18:30:00Z'), 'MZ').surcharge).toBe(200);
  });

  test('desconto por volume só a partir do limite do mês', () => {
    const t = { base_fee: 1500, routing_fee: 500, proof_fee: 200, bulky_fee: null, long_wait_fee: null, currency_code: 'AOA' };
    const d = { volume_discount_threshold: 10, volume_discount_routing_fee: 100, routing_fee: 50 };
    expect(aplicarDesconto(t, d, 9).routing_fee).toBe(500);
    expect(aplicarDesconto(t, d, 10).routing_fee).toBe(100);
  });
});

describe('pricing: quote', () => {
  test('aceita zone_code_hint (o site) e country_code em falta → Angola', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DIA));
    cenario();
    const r = await pedir(handler, 'quote', { zone_code_hint: 'A' }, 'cidadao');
    expect(r).toEqual({
      status: 200,
      json: {
        country_code: 'AO', zone_code: 'A', zone_estimated: false, is_free_pilot: true, currency_code: 'AOA',
        breakdown: { frete: 1500, roteamento: 500, prova: 200 },
        amount_total: 2200, amount_driver: 1500, amount_platform: 700,
      },
    });
  });

  test('sem zona (a app): calcula pela morada de destino e pelo município da recolha', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DIA));
    cenario();
    const a = await pedir(handler, 'quote', { country_code: 'AO', zone_code_hint: null, address_id: MORADA, origin_municipality_id: MUN }, 'cidadao');
    expect(a.json).toMatchObject({ zone_code: 'A', zone_estimated: true, amount_total: 2200 });
    const b = await pedir(handler, 'quote', { country_code: 'AO', origin_latitude: -12.7, origin_longitude: 15.7 }, 'cidadao');
    expect(b.json).toMatchObject({ zone_code: 'B', zone_estimated: true, amount_total: 3200 });
  });

  test('extras (volumoso, espera longa) e sobretaxa noturna', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T21:00:00Z'));
    cenario();
    const r = await pedir(handler, 'quote', { zone_code: 'A', is_volumoso: true, is_espera_longa: true }, 'cidadao');
    expect(r.json.breakdown).toEqual({ frete: 1500, roteamento: 500, prova: 200, volumoso: 500, espera_longa: 300, noturno_fim_de_semana: 600 });
    expect(r.json.amount_total).toBe(3600);
  });

  test('tabela negociada só para quem é membro da organização', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DIA));
    cenario();
    expect((await pedir(handler, 'quote', { zone_code: 'A', organization_id: ORG }, 'cidadao')).json).toMatchObject({ amount_total: 2200, is_free_pilot: true });
    expect((await pedir(handler, 'quote', { zone_code: 'A', organization_id: ORG }, 'super')).json).toMatchObject({ amount_total: 1700, is_free_pilot: false });
  });

  test('país sem tarifas → 409 pricing_not_configured', async () => {
    cenario();
    expect(await pedir(handler, 'quote', { country_code: 'MZ', zone_code: 'A' }, 'cidadao')).toEqual({
      status: 409,
      json: { error: 'pricing_not_configured', country_code: 'MZ', zone_code: 'A' },
    });
  });
});

describe('pricing: admin_update_zone e list_zones', () => {
  test('só super_admin; valida valores; grava, espelha a tabela antiga e audita', async () => {
    const s = cenario();
    expect((await pedir(handler, 'admin_update_zone', { zone_code: 'A', base_fee: 1 }, 'cidadao')).status).toBe(403);
    expect((await pedir(handler, 'admin_update_zone', { zone_code: 'A', base_fee: 1 }, null)).status).toBe(401);
    expect((await pedir(handler, 'admin_update_zone', { zone_code: 'Z', base_fee: 1 }, 'super')).status).toBe(400);
    expect((await pedir(handler, 'admin_update_zone', { zone_code: 'A', base_fee: -5 }, 'super')).status).toBe(400);
    expect((await pedir(handler, 'admin_update_zone', { zone_code: 'A' }, 'super')).status).toBe(400);
    expect(await pedir(handler, 'admin_update_zone', { zone_code: 'A', base_fee: '1800', bulky_fee: 600 }, 'super')).toEqual({ status: 200, json: { ok: true } });
    const t = s.tabelas();
    expect(t.country_pricing_zones.find((z: any) => z.zone_code === 'A')).toMatchObject({ base_fee: 1800, bulky_fee: 600, updated_by: SUPER });
    expect(t.pricing_zones[0]).toMatchObject({ base_fee: 1800 });
    expect(t.audit_logs).toEqual([expect.objectContaining({ action: 'pricing_zone_updated', actor_id: SUPER })]);
    expect((await pedir(handler, 'list_zones', {}, 'cidadao')).json.zones).toHaveLength(3);
  });
});
