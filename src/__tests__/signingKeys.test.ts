/**
 * @jest-environment node
 */
// A Edge Function "signing-keys" a correr de verdade (index.ts), com um
// Supabase falso em memória que conhece as colunas verdadeiras da tabela.
import { describe, expect, jest, test } from '@jest/globals';
import { p256 } from '@noble/curves/nist.js';
import { readFileSync } from 'fs';
import { join } from 'path';

import { decidirRegisto, jwkPublicaValida, mesmaChave } from '../../supabase/functions/signing-keys/regras';
import { chavePublicaParaJwk } from '@/services/crypto/jwk';
import { COLUNAS_AUDIT_LOGS, COLUNAS_SIGNING_KEYS } from '@/testes/esquema';
import { carregarFuncao, criarSupabaseFalso, pedir } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/signing-keys/index.ts');
  });
});

const ESTAFETA = 'aaaaaaaa-0000-4000-8000-000000000002';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000004';
const APARELHO = 'app-11111111-2222-4333-8444-555555555555';

const novaJwk = () => chavePublicaParaJwk(p256.getPublicKey(p256.utils.randomSecretKey(), false));

function cenario(signingKeys: Record<string, unknown>[] = []) {
  const s = criarSupabaseFalso({
    sessoes: { estafeta: ESTAFETA, outro: OUTRO },
    colunas: { signing_keys: COLUNAS_SIGNING_KEYS, audit_logs: COLUNAS_AUDIT_LOGS },
    tabelas: { signing_keys: signingKeys, audit_logs: [] },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

const registar = (corpo: unknown, token = 'estafeta') => pedir(handler, 'register', corpo, token);

describe('signing-keys v5: registo da chave do aparelho', () => {
  test('sem sessão: 401', async () => {
    cenario();
    expect((await registar({ device_id: APARELHO, public_key_jwk: novaJwk() }, 'falso')).status).toBe(401);
  });

  test('primeira chave: grava só os campos públicos e regista em audit_logs', async () => {
    const s = cenario();
    const jwk = novaJwk();
    const r = await registar({ device_id: APARELHO, public_key_jwk: { ...jwk, ext: true, key_ops: ['verify'] } });
    expect(r).toEqual({ status: 200, json: { ok: true } });
    const [linha] = s.tabelas().signing_keys;
    expect(linha).toMatchObject({ user_id: ESTAFETA, device_id: APARELHO, public_key_jwk: jwk });
    expect(s.tabelas().audit_logs).toEqual([
      expect.objectContaining({
        actor_id: ESTAFETA, action: 'signing_key_registered', entity_type: 'signing_key', entity_id: linha.id,
        before: null, after: { device_id: APARELHO, public_key_jwk: jwk },
      }),
    ]);
  });

  test('a mesma chave outra vez: ok, sem gravar nada nem encher a auditoria', async () => {
    const jwk = novaJwk();
    const s = cenario([{ id: 'k1', user_id: ESTAFETA, device_id: APARELHO, public_key_jwk: jwk, revoked_at: null }]);
    expect(await registar({ device_id: APARELHO, public_key_jwk: jwk })).toEqual({ status: 200, json: { ok: true } });
    expect(s.tabelas().signing_keys).toHaveLength(1);
    expect(s.tabelas().audit_logs).toEqual([]);
  });

  test('troca de chave: grava a nova e guarda a antiga em audit_logs (valor jurídico)', async () => {
    const antiga = novaJwk();
    const nova = novaJwk();
    const s = cenario([{ id: 'k1', user_id: ESTAFETA, device_id: APARELHO, public_key_jwk: antiga, revoked_at: null }]);
    expect(await registar({ device_id: APARELHO, public_key_jwk: nova })).toEqual({ status: 200, json: { ok: true, replaced: true } });
    expect(s.tabelas().signing_keys).toEqual([expect.objectContaining({ id: 'k1', public_key_jwk: nova })]);
    expect(s.tabelas().audit_logs).toEqual([
      expect.objectContaining({
        action: 'signing_key_replaced', entity_id: 'k1',
        before: { device_id: APARELHO, public_key_jwk: antiga },
        after: { device_id: APARELHO, public_key_jwk: nova },
      }),
    ]);
  });

  test('chave revogada: o aparelho não regista outra sozinho (403)', async () => {
    const antiga = novaJwk();
    const s = cenario([{ id: 'k1', user_id: ESTAFETA, device_id: APARELHO, public_key_jwk: antiga, revoked_at: '2026-10-01T00:00:00Z' }]);
    const r = await registar({ device_id: APARELHO, public_key_jwk: novaJwk() });
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/^SIGNING_KEY_REVOKED/);
    expect(s.tabelas().signing_keys[0].public_key_jwk).toEqual(antiga);
    expect(s.tabelas().audit_logs).toEqual([]);
  });

  test('a chave de outra pessoa no mesmo device_id não é tocada', async () => {
    const deOutro = novaJwk();
    const s = cenario([{ id: 'k1', user_id: OUTRO, device_id: APARELHO, public_key_jwk: deOutro, revoked_at: null }]);
    expect((await registar({ device_id: APARELHO, public_key_jwk: novaJwk() })).status).toBe(200);
    expect(s.tabelas().signing_keys.find((l) => l.id === 'k1')!.public_key_jwk).toEqual(deOutro);
    expect(s.tabelas().signing_keys).toHaveLength(2);
  });

  test('recusa chave privada, curva errada, coordenadas inválidas ou campos em falta', async () => {
    const jwk = novaJwk();
    const s = cenario();
    const casos: [unknown, number][] = [
      [{ device_id: APARELHO }, 400],
      [{ public_key_jwk: jwk }, 400],
      [{ device_id: APARELHO, public_key_jwk: { ...jwk, d: 'segredo' } }, 422],
      [{ device_id: APARELHO, public_key_jwk: { ...jwk, crv: 'P-384' } }, 422],
      [{ device_id: APARELHO, public_key_jwk: { ...jwk, x: 'curto' } }, 422],
      [{ device_id: APARELHO, public_key_jwk: { kty: 'device', device_id: APARELHO } }, 422],
    ];
    for (const [corpo, estado] of casos) expect((await registar(corpo)).status).toBe(estado);
    expect(s.tabelas().signing_keys).toEqual([]);
  });

  test('status: registada, revogada ou desconhecida', async () => {
    cenario([
      { id: 'k1', user_id: ESTAFETA, device_id: APARELHO, public_key_jwk: novaJwk(), revoked_at: null },
      { id: 'k2', user_id: ESTAFETA, device_id: 'app-revogado', public_key_jwk: novaJwk(), revoked_at: '2026-10-01T00:00:00Z' },
    ]);
    expect((await pedir(handler, 'status', { device_id: APARELHO }, 'estafeta')).json).toEqual({ registered: true, revoked: false });
    expect((await pedir(handler, 'status', { device_id: 'app-revogado' }, 'estafeta')).json).toEqual({ registered: false, revoked: true });
    expect((await pedir(handler, 'status', { device_id: 'nenhum' }, 'estafeta')).json).toEqual({ registered: false, revoked: false });
  });
});

describe('signing-keys v5: regras puras', () => {
  test('jwkPublicaValida devolve só kty, crv, x e y', () => {
    const jwk = novaJwk();
    expect(jwkPublicaValida({ ...jwk, alg: 'ES256' })).toEqual(jwk);
    expect(jwkPublicaValida(null)).toBeNull();
    expect(jwkPublicaValida([jwk])).toBeNull();
  });

  test('mesmaChave compara x e y; decidirRegisto cobre os 4 casos', () => {
    const a = novaJwk();
    const b = novaJwk();
    expect(mesmaChave(a, { ...a, ext: true })).toBe(true);
    expect(mesmaChave(a, b)).toBe(false);
    expect(decidirRegisto(null, a)).toEqual({ tipo: 'nova' });
    expect(decidirRegisto({ public_key_jwk: a, revoked_at: null }, a)).toEqual({ tipo: 'igual' });
    expect(decidirRegisto({ public_key_jwk: a, revoked_at: null }, b)).toEqual({ tipo: 'troca' });
    expect(decidirRegisto({ public_key_jwk: { kty: 'device' } }, b)).toEqual({ tipo: 'troca' });
    expect(decidirRegisto({ public_key_jwk: a, revoked_at: '2026-10-01' }, a)).toEqual({ tipo: 'revogada' });
  });
});

describe('migração da revogação', () => {
  test('cria signing_keys.revoked_at (lida pela deliveries e pela signing-keys)', () => {
    const sql = readFileSync(
      join(__dirname, '../../supabase/migrations/20261001090000_signing_keys_revogacao.sql'),
      'utf8',
    );
    expect(sql).toMatch(/alter table public\.signing_keys\s+add column if not exists revoked_at timestamptz/i);
    expect(COLUNAS_SIGNING_KEYS).toContain('revoked_at');
  });
});
