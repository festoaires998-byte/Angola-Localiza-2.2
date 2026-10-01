/**
 * @jest-environment node
 */
// A Edge Function "apagar-conta" a correr de verdade: apaga os ficheiros
// pessoais, chama a limpeza na base de dados e faz a eliminação suave da conta.
import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { caminhosDaPasta, confirmacaoValida, PALAVRA_CONFIRMACAO } from '../../supabase/functions/apagar-conta/regras';
import { PALAVRA_CONFIRMACAO as PALAVRA_DA_APP } from '@/services/conta/palavra';
import { carregarFuncao, criarSupabaseFalso, URL_SUPABASE_FALSO } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/apagar-conta/index.ts');
  });
});

const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002';
const bytes = new Uint8Array([1]);

function cenario(cargos: { user_id: string; role: string }[] = []) {
  const s = criarSupabaseFalso({
    sessoes: { ana: ANA },
    tabelas: { organization_members: cargos },
    ficheiros: {
      'kyc-artifacts': { [`${ANA}/bi-frente.jpg`]: bytes, [`${ANA}/selfie.jpg`]: bytes, [`${OUTRO}/bi.jpg`]: bytes },
      'chat-media': { [`${ANA}/foto.jpg`]: bytes },
      'delivery-proofs': { [`${ANA}/pod.jpg`]: bytes },
    },
    rpc: { apagar_dados_da_conta: () => ({ moradas_privadas_apagadas: 1 }) },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

async function pedir(corpo: unknown, token: string | null = 'ana') {
  const res = await handler(
    new Request(`${URL_SUPABASE_FALSO}/functions/v1/apagar-conta?action=apagar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe('apagar-conta', () => {
  test('sem sessão: 401; sem escrever APAGAR: 400 e nada é apagado', async () => {
    const s = cenario();
    expect((await pedir({ confirmacao: 'APAGAR' }, null)).status).toBe(401);
    expect((await pedir({ confirmacao: 'sim' })).status).toBe(400);
    expect(s.removidos).toEqual([]);
    expect(s.rpcsChamadas).toEqual([]);
    expect(s.contasApagadas).toEqual([]);
  });

  test('apaga os ficheiros pessoais (BI, selfie, chat), limpa os dados e faz a eliminação suave', async () => {
    const s = cenario();
    const r = await pedir({ confirmacao: ' apagar ' });
    expect(r).toEqual({ status: 200, json: { ok: true, moradas_privadas_apagadas: 1 } });
    expect(s.removidos.map((f) => `${f.bucket}/${f.nome}`).sort()).toEqual([
      `chat-media/${ANA}/foto.jpg`,
      `kyc-artifacts/${ANA}/bi-frente.jpg`,
      `kyc-artifacts/${ANA}/selfie.jpg`,
    ]);
    expect(s.rpcsChamadas).toContainEqual({ nome: 'apagar_dados_da_conta', args: { p_user: ANA } });
    expect(s.contasAlteradas).toEqual([{ id: ANA, mudancas: { user_metadata: {} } }]);
    expect(s.contasApagadas).toEqual([{ id: ANA, suave: true }]);
  });

  test('não toca nos ficheiros de outras pessoas nem nas provas de entrega', async () => {
    const s = cenario();
    await pedir({ confirmacao: 'APAGAR' });
    expect(s.removidos.some((f) => f.nome.startsWith(OUTRO))).toBe(false);
    expect(s.removidos.some((f) => f.bucket === 'delivery-proofs')).toBe(false);
  });

  test('um super admin não se apaga sozinho (409)', async () => {
    const s = cenario([{ user_id: ANA, role: 'super_admin' }]);
    const r = await pedir({ confirmacao: 'APAGAR' });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/^SUPER_ADMIN/);
    expect(s.contasApagadas).toEqual([]);
  });
});

describe('apagar-conta: regras e migração', () => {
  test('a app pede a mesma palavra que o servidor', () => {
    expect(PALAVRA_DA_APP).toBe(PALAVRA_CONFIRMACAO);
  });

  test('confirmação e caminhos da pasta', () => {
    expect(confirmacaoValida('APAGAR')).toBe(true);
    expect(confirmacaoValida('apagar')).toBe(true);
    expect(confirmacaoValida('apaga')).toBe(false);
    expect(confirmacaoValida(undefined)).toBe(false);
    expect(caminhosDaPasta(ANA, [{ name: 'a.jpg', id: '1' }, { name: 'subpasta', id: null }, { name: '', id: '2' }])).toEqual([`${ANA}/a.jpg`]);
  });

  test('a função SQL só pode ser chamada pelo servidor e apaga/limpa o que foi decidido', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261001120000_apagar_conta.sql'), 'utf8');
    expect(sql).toMatch(/revoke all on function public\.apagar_dados_da_conta\(uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.apagar_dados_da_conta\(uuid\) to service_role/);
    for (const tabela of ['favorites', 'search_history', 'notifications', 'sync_operations', 'app_errors', 'organization_members', 'driver_applications', 'driver_profiles']) {
      expect(sql).toMatch(new RegExp(`delete from public\\.${tabela} where user_id = p_user`));
    }
    expect(sql).toMatch(/update public\.signing_keys set revoked_at = now\(\)/);
    expect(sql).toMatch(/set id_hash = null/);
    // Entregas e provas ficam (sem nome): a função nunca apaga entregas.
    expect(sql).not.toMatch(/delete from public\.deliver/);
  });
});
