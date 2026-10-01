/**
 * @jest-environment node
 */
// A Edge Function "limpeza-kyc" a correr de verdade: apaga as fotos da
// verificação simples 90 dias depois da decisão, e só com o token do Vault.
import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { limiteRetencao, nomeNoBucket, nomesDoPedido } from '../../supabase/functions/limpeza-kyc/regras';
import { carregarFuncao, criarSupabaseFalso, URL_SUPABASE_FALSO } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/limpeza-kyc/index.ts');
  });
});

const TOKEN = 'a'.repeat(64);
const DIA = 24 * 3600 * 1000;
const haDias = (d: number) => new Date(Date.now() - d * DIA).toISOString();

const pedido = (id: string, status: string | null, reviewedAt: string | null) => ({
  user_id: id,
  citizen_id_status: status,
  citizen_id_reviewed_at: reviewedAt,
  citizen_id_photo_front_url: `${id}/bi-frente.jpg`,
  citizen_id_photo_back_url: `kyc-artifacts/${id}/bi-verso.jpg`,
  citizen_selfie_url: `${id}/selfie.jpg`,
  citizen_id_artifacts_purged_at: null,
});

function cenario(opcoes: { falharRemover?: boolean } = {}) {
  const s = criarSupabaseFalso({
    tabelas: {
      user_identity: [
        pedido('aprovado-velho', 'VERIFIED', haDias(91)),
        pedido('recusado-velho', 'REJECTED', haDias(120)),
        pedido('aprovado-recente', 'VERIFIED', haDias(89)),
        pedido('por-rever', 'PENDING_REVIEW', null),
      ],
      audit_logs: [],
    },
    rpc: { token_limpeza_kyc_valido: (a: { p_token: string }) => a.p_token === TOKEN },
    falharRemover: opcoes.falharRemover,
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

async function chamar(token: string | null = TOKEN) {
  const res = await handler(
    new Request(`${URL_SUPABASE_FALSO}/functions/v1/limpeza-kyc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-limpeza-token': token } : {}) },
      body: '{}',
    }),
  );
  return { status: res.status, json: await res.json() };
}

const linha = (s: ReturnType<typeof cenario>, id: string) => s.tabelas().user_identity.find((l) => l.user_id === id)!;

describe('limpeza-kyc', () => {
  test('sem o token certo não apaga nada (401)', async () => {
    const s = cenario();
    expect((await chamar(null)).status).toBe(401);
    expect((await chamar('errado')).status).toBe(401);
    expect(s.removidos).toEqual([]);
  });

  test('apaga as 3 fotos das decisões com mais de 90 dias; mantém as recentes e as por rever', async () => {
    const s = cenario();
    const r = await chamar();
    expect(r.json).toEqual({ ok: true, apagados: 2, falhas: [] });
    expect(s.removidos.map((f) => f.nome).sort()).toEqual([
      'aprovado-velho/bi-frente.jpg', 'aprovado-velho/bi-verso.jpg', 'aprovado-velho/selfie.jpg',
      'recusado-velho/bi-frente.jpg', 'recusado-velho/bi-verso.jpg', 'recusado-velho/selfie.jpg',
    ]);
    expect(s.removidos.every((f) => f.bucket === 'kyc-artifacts')).toBe(true);
    // A decisão fica; as ligações às fotos não.
    expect(linha(s, 'aprovado-velho')).toMatchObject({
      citizen_id_status: 'VERIFIED',
      citizen_id_photo_front_url: null,
      citizen_id_photo_back_url: null,
      citizen_selfie_url: null,
      citizen_id_artifacts_purged_at: expect.any(String),
    });
    expect(linha(s, 'aprovado-recente').citizen_selfie_url).toBe('aprovado-recente/selfie.jpg');
    expect(linha(s, 'por-rever').citizen_selfie_url).toBe('por-rever/selfie.jpg');
    expect(s.tabelas().audit_logs.map((a) => [a.action, a.entity_id])).toEqual([
      ['citizen_id_artifacts_purged', 'aprovado-velho'],
      ['citizen_id_artifacts_purged', 'recusado-velho'],
    ]);
  });

  test('chamar outra vez não volta a apagar nada', async () => {
    const s = cenario();
    await chamar();
    const antes = s.removidos.length;
    expect((await chamar()).json).toEqual({ ok: true, apagados: 0, falhas: [] });
    expect(s.removidos).toHaveLength(antes);
  });

  test('se o Storage falhar, a linha fica igual para tentar no dia seguinte', async () => {
    const s = cenario({ falharRemover: true });
    const r = await chamar();
    expect(r.json.apagados).toBe(0);
    expect(r.json.falhas).toHaveLength(2);
    expect(linha(s, 'aprovado-velho').citizen_id_artifacts_purged_at).toBeNull();
    expect(linha(s, 'aprovado-velho').citizen_selfie_url).toBe('aprovado-velho/selfie.jpg');
  });
});

describe('limpeza-kyc: regras puras', () => {
  test('nomeNoBucket aceita os 3 formatos e recusa outros buckets e ".."', () => {
    expect(nomeNoBucket('u1/a.jpg')).toBe('u1/a.jpg');
    expect(nomeNoBucket('kyc-artifacts/u1/a.jpg')).toBe('u1/a.jpg');
    expect(nomeNoBucket('https://x.supabase.co/storage/v1/object/public/kyc-artifacts/u1/a%20b.jpg?t=1')).toBe('u1/a b.jpg');
    expect(nomeNoBucket('https://x.supabase.co/storage/v1/object/public/field-photos/u1/a.jpg')).toBeNull();
    expect(nomeNoBucket('https://exemplo.ao/a.jpg')).toBeNull();
    expect(nomeNoBucket('u1/../u2/a.jpg')).toBeNull();
    expect(nomeNoBucket('')).toBeNull();
    expect(nomeNoBucket(null)).toBeNull();
    expect(nomeNoBucket('bi-antigo-na-raiz.jpg')).toBe('bi-antigo-na-raiz.jpg');
  });

  test('nomesDoPedido sem repetidos nem vazios; limiteRetencao = 90 dias antes', () => {
    expect(nomesDoPedido({ citizen_id_photo_front_url: 'u/a.jpg', citizen_id_photo_back_url: 'kyc-artifacts/u/a.jpg', citizen_selfie_url: null })).toEqual(['u/a.jpg']);
    expect(limiteRetencao(new Date('2026-10-01T00:00:00.000Z'))).toBe('2026-07-03T00:00:00.000Z');
  });

  test('a migração guarda o token só no Vault e agenda o pedido diário', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261001100000_limpeza_fotos_kyc_90_dias.sql'), 'utf8');
    expect(sql).toMatch(/vault\.create_secret\(\s*encode\(extensions\.gen_random_bytes\(32\), 'hex'\)/);
    expect(sql).toMatch(/revoke all on function public\.token_limpeza_kyc_valido\(text\) from public, anon, authenticated/);
    expect(sql).toMatch(/cron\.schedule\(\s*'limpeza-fotos-kyc',\s*'15 3 \* \* \*'/);
  });
});
