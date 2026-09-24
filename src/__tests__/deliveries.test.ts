/**
 * @jest-environment node
 */
// A Edge Function "deliveries" a correr de verdade (index.ts), com um Supabase
// falso em memória. O ambiente "node" dá Request, Response e crypto.subtle,
// como no Deno.
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { p256 } from '@noble/curves/nist.js';

import { criarAssinarProva, paraCamposProva } from '@/services/crypto/assinarProva';
import { chavePublicaParaJwk } from '@/services/crypto/jwk';
import { carregarFuncao, criarSupabaseFalso, pedir, type SupabaseFalso } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/deliveries/index.ts');
  });
});

const REMETENTE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ESTAFETA = 'aaaaaaaa-0000-4000-8000-000000000002';
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000003';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000004';
const SUPER = 'aaaaaaaa-0000-4000-8000-000000000005';
const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';
const ENTREGA = 'cccccccc-0000-4000-8000-000000000001';

const TOKENS: Record<string, string> = { remetente: REMETENTE, estafeta: ESTAFETA, admin: ADMIN, outro: OUTRO, super: SUPER };

const FUTURO = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const PASSADO = new Date(Date.now() - 3600 * 1000).toISOString();

function cenario(entrega: Record<string, unknown> = {}) {
  const s = criarSupabaseFalso({
    sessoes: TOKENS,
    tabelas: {
      organization_members: [
        { user_id: ESTAFETA, role: 'estafeta', organization_id: 'org-1' },
        { user_id: ADMIN, role: 'admin_nacional', organization_id: 'org-1' },
        { user_id: SUPER, role: 'super_admin', organization_id: 'org-1' },
      ],
      addresses: [{ id: MORADA, created_by: OUTRO, confidence_score: 50, flagged_for_review: false }],
      deliveries: [
        {
          id: ENTREGA,
          tracking_code: 'ABC123',
          status: 'OUT_FOR_DELIVERY',
          created_by: REMETENTE,
          assigned_driver: ESTAFETA,
          address_id: MORADA,
          confirmation_pin: '4821',
          confirmation_pin_expires_at: FUTURO,
          zone_code: null,
          payer_organization_id: null,
          ...entrega,
        },
      ],
      pricing_zones: [{ zone_code: 'Z1', base_fee: 1000, routing_fee: 200, proof_fee: 100 }],
    },
    predefinicoes: {
      deliveries: () => ({ tracking_code: 'NOVO123456', status: 'CREATED', confirmation_pin: '1234', confirmation_pin_expires_at: FUTURO }),
    },
    rpc: {
      is_admin: ({ check_user_id }, t) =>
        t.organization_members.some(
          (m) => m.user_id === check_user_id && ['super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal'].includes(m.role),
        ),
    },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

const linhas = (s: SupabaseFalso, t: string) => s.tabelas()[t] ?? [];
const entrega = (s: SupabaseFalso) => linhas(s, 'deliveries').find((d) => d.id === ENTREGA)!;

describe('deliveries: sessão', () => {
  test('sem sessão válida responde 401', async () => {
    cenario();
    expect((await pedir(handler, 'create', {}, null)).status).toBe(401);
    expect((await pedir(handler, 'create', {}, 'token-falso')).status).toBe(401);
  });

  test('ação desconhecida responde 400', async () => {
    cenario();
    expect(await pedir(handler, 'nao_existe', {}, 'remetente')).toEqual({ status: 400, json: { error: 'acao desconhecida' } });
  });
});

describe('deliveries: criar', () => {
  test('exige morada e destinatário, e um contacto angolano de 9 dígitos', async () => {
    cenario();
    expect((await pedir(handler, 'create', { recipient_name: 'Ana' }, 'remetente')).status).toBe(400);
    const r = await pedir(handler, 'create', { address_id: MORADA, recipient_name: 'Ana', recipient_phone: '+244 92 123' }, 'remetente');
    expect(r.status).toBe(422);
    expect(r.json.error).toMatch(/^CONTACTO_INVALID/);
  });

  test('cria a entrega em nome de quem pede, com histórico, cobrança da zona e registo', async () => {
    const s = cenario();
    const r = await pedir(
      handler,
      'create',
      { address_id: MORADA, recipient_name: 'Ana', recipient_phone: '+244 923 456 789', zone_code: 'Z1', created_by: OUTRO },
      'remetente',
    );
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ created_by: REMETENTE, status: 'CREATED', recipient_phone: '+244 923 456 789' });
    expect(linhas(s, 'delivery_status_history')).toEqual([expect.objectContaining({ delivery_id: r.json.id, status: 'CREATED' })]);
    expect(linhas(s, 'usage_events')).toEqual([
      expect.objectContaining({ event_type: 'DELIVERY_ROUTED', amount_total: 1300, amount_driver: 1000, is_free_pilot: true }),
    ]);
    expect(linhas(s, 'audit_logs')).toEqual([expect.objectContaining({ action: 'delivery_routed', actor_id: REMETENTE })]);
  });
});

describe('deliveries: atribuir estafeta', () => {
  test('só quem criou ou um administrador, e só no estado CREATED', async () => {
    const s = cenario({ status: 'CREATED', assigned_driver: null });
    expect((await pedir(handler, 'assign_driver', { delivery_id: ENTREGA, driver_id: ESTAFETA }, 'outro')).status).toBe(403);
    expect(await pedir(handler, 'assign_driver', { delivery_id: ENTREGA, driver_id: ESTAFETA }, 'remetente')).toEqual({
      status: 200,
      json: { ok: true, status: 'ASSIGNED' },
    });
    expect(entrega(s)).toMatchObject({ status: 'ASSIGNED', assigned_driver: ESTAFETA });
    expect((await pedir(handler, 'assign_driver', { delivery_id: ENTREGA, driver_id: ESTAFETA }, 'admin')).status).toBe(400);
  });
});

describe('deliveries: mudar de estado', () => {
  test('só o estafeta, um administrador ou quem criou (para cancelar)', async () => {
    cenario();
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'recusa' }, 'outro')).status).toBe(403);
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'recusa' }, 'remetente')).status).toBe(403);
  });

  test('segue as etapas: não salta de OUT_FOR_DELIVERY para PICKED_UP', async () => {
    cenario();
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'PICKED_UP', proof: { photo_url: 'x' } }, 'estafeta');
    expect(r).toEqual({ status: 400, json: { error: 'transicao invalida: OUT_FOR_DELIVERY -> PICKED_UP' } });
  });

  test('a recolha exige foto', async () => {
    cenario({ status: 'ASSIGNED' });
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'PICKED_UP' }, 'estafeta')).status).toBe(422);
  });

  test('a falha exige um motivo da lista; marca a morada para revisão e avisa quem a registou', async () => {
    const s = cenario();
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'chuva' }, 'estafeta')).status).toBe(400);
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'morada_nao_encontrada' }, 'estafeta');
    expect(r.status).toBe(200);
    expect(linhas(s, 'addresses')[0]).toMatchObject({ flagged_for_review: true, confidence_score: 35 });
    expect(linhas(s, 'notifications')).toEqual([expect.objectContaining({ user_id: OUTRO, entity_id: MORADA })]);
  });
});

describe('deliveries v18: fechar a entrega (PIN)', () => {
  test('PIN expirado responde 410 e PIN errado 400', async () => {
    cenario({ confirmation_pin_expires_at: PASSADO });
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821' }, 'estafeta')).status).toBe(410);
    cenario();
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '0000' }, 'estafeta')).status).toBe(400);
  });

  test('PIN certo fecha a entrega e grava a prova (POD)', async () => {
    const s = cenario();
    const r = await pedir(
      handler,
      'update_status',
      { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof: { photo_url: 'https://x/f.jpg', signature_url: 'https://x/a.png' } },
      'estafeta',
    );
    expect(r).toEqual({ status: 200, json: { ok: true, status: 'DELIVERED', crypto_verified: null } });
    expect(entrega(s).status).toBe('DELIVERED');
    expect(linhas(s, 'delivery_proofs')).toEqual([expect.objectContaining({ proof_type: 'POD', created_by: ESTAFETA })]);
  });
});

describe('deliveries v18: assinatura criptográfica da app', () => {
  const chavePrivada = p256.utils.randomSecretKey();
  const jwk = chavePublicaParaJwk(p256.getPublicKey(chavePrivada, false));
  const assinarProva = criarAssinarProva({
    assinar: async (m) => ({ deviceId: 'aparelho-1', assinatura: p256.sign(m, chavePrivada, { prehash: true, lowS: true, format: 'compact' }) }),
  });
  const dados = { delivery_id: ENTREGA, lat: -12.77, lng: 15.73, plus_code: '6GXV+2C', foto_sha256: null, assinatura_manuscrita_sha256: null };

  let s: SupabaseFalso;
  beforeEach(() => {
    s = cenario();
    s.tabelas().signing_keys = [{ user_id: ESTAFETA, device_id: 'aparelho-1', public_key_jwk: jwk }];
  });

  test('a assinatura feita pela app confere no servidor', async () => {
    const proof = { photo_url: 'https://x/f.jpg', ...paraCamposProva(await assinarProva(dados)) };
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof }, 'estafeta');
    expect(r.json.crypto_verified).toBe(true);
    expect(linhas(s, 'delivery_proofs')[0].crypto_verified).toBe(true);
  });

  test('não confere se foi assinada para outra entrega ou se o texto foi alterado', async () => {
    const outra = paraCamposProva(await assinarProva({ ...dados, delivery_id: 'outra' }));
    let r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof: outra }, 'estafeta');
    expect(r.json.crypto_verified).toBe(false);

    s = cenario();
    s.tabelas().signing_keys = [{ user_id: ESTAFETA, device_id: 'aparelho-1', public_key_jwk: jwk }];
    const campos = paraCamposProva(await assinarProva(dados));
    const alterada = { ...campos, crypto_payload: campos.crypto_payload.replace('-12.77', '-12.78') };
    r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof: alterada }, 'estafeta');
    expect(r.json.crypto_verified).toBe(false);
  });
});

describe('deliveries: apagar', () => {
  test('só o super admin apaga uma entrega ou o histórico todo (com confirmação)', async () => {
    const s = cenario();
    expect((await pedir(handler, 'delete_one', { delivery_id: ENTREGA }, 'admin')).status).toBe(403);
    expect((await pedir(handler, 'clear_all', { confirm: 'sim' }, 'super')).status).toBe(400);
    expect(await pedir(handler, 'delete_one', { delivery_id: ENTREGA }, 'super')).toEqual({ status: 200, json: { ok: true } });
    expect(linhas(s, 'deliveries')).toEqual([]);
  });
});
