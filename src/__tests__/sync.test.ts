/**
 * @jest-environment node
 */
// A Edge Function "sync" a correr de verdade (index.ts), com um Supabase falso
// em memória. Prova que a fila feita sem rede não aprova moradas nem mexe na validação.
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CAMPOS_PROIBIDOS,
  ESTADO_INICIAL,
  limparEdicaoMorada,
  limparFavorito,
  limparMoradaNova,
  podeEditarMorada,
} from '../../supabase/functions/sync/regras';
import { carregarFuncao, criarSupabaseFalso, pedir, URL_SUPABASE_FALSO, type SupabaseFalso } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/sync/index.ts');
  });
});

const CIDADAO = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002';
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000003';
const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';
const MORADA_APROVADA = 'bbbbbbbb-0000-4000-8000-000000000002';
const RUA = 'dddddddd-0000-4000-8000-000000000001';

let n = 0;
const opId = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function cenario() {
  const s = criarSupabaseFalso({
    sessoes: { cidadao: CIDADAO, outro: OUTRO, admin: ADMIN },
    tabelas: {
      organization_members: [{ user_id: ADMIN, role: 'admin_nacional' }],\n      signing_keys: [\n        { user_id: CIDADAO, device_id: 'aparelho-1' },\n        { user_id: OUTRO, device_id: 'aparelho-1' },\n        { user_id: ADMIN, device_id: 'aparelho-1' },\n      ],
      addresses: [
        { id: MORADA, status: 'PROPOSED', created_by: CIDADAO, reference: 'Antiga', updated_at: '2026-09-20T10:00:00.000Z' },
        { id: MORADA_APROVADA, status: 'APPROVED', created_by: CIDADAO, reference: 'Aprovada', updated_at: '2026-09-20T10:00:00.000Z' },
      ],
    },
    rpc: {
      is_admin: ({ check_user_id }, t) => t.organization_members.some((m) => m.user_id === check_user_id),
    },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

const linhas = (s: SupabaseFalso, t: string) => s.tabelas()[t] ?? [];
const morada = (s: SupabaseFalso, id: string) => linhas(s, 'addresses').find((a) => a.id === id)!;

async function sincronizar(token: string, ...ops: { operation_type: string; payload: unknown; operation_id?: string }[]) {
  const operations = ops.map((o) => ({ operation_id: o.operation_id ?? opId(), device_id: 'aparelho-1', ...o }));
  const r = await pedir(handler, null, { operations }, token);
  return r.json.results as { operation_id: string; status: string; error?: string | null }[];
}

/** O que o site antigo mete na fila quando grava uma morada sem rede. */
const MORADA_DO_SITE = {
  latitude: -12.7761,
  longitude: 15.7392,
  location: 'SRID=4326;POINT(15.7392 -12.7761)',
  plus_code: '6GXV+2C',
  postal_code: 'AO-HUA-23456789-42',
  visibility_level: 'PUBLIC',
  status: 'PROPOSED',
  source: 'app',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sync v8: create_address', () => {
  test('a morada do site (sem rede) é criada por validar, em nome de quem sincroniza', async () => {
    const s = cenario();
    const [r] = await sincronizar('cidadao', { operation_type: 'create_address', payload: MORADA_DO_SITE });
    expect(r).toMatchObject({ status: 'SYNCED', error: null });
    const nova = linhas(s, 'addresses')[2];
    expect(nova).toMatchObject({
      status: 'PROPOSED',
      source: 'app',
      created_by: CIDADAO,
      latitude: -12.7761,
      longitude: 15.7392,
      location: 'SRID=4326;POINT(15.7392 -12.7761)',
      plus_code: '6GXV+2C',
      visibility_level: 'PUBLIC',
    });
  });

  test('não aceita morada já aprovada, oficial ou publicada: nada é gravado', async () => {
    const s = cenario();
    for (const status of ['APPROVED', 'OFFICIAL', 'PUBLISHED']) {
      const [r] = await sincronizar('cidadao', { operation_type: 'create_address', payload: { ...MORADA_DO_SITE, status } });
      expect(r).toEqual({ operation_id: expect.any(String), status: 'FAILED', error: 'uma morada nova fica sempre por validar (PROPOSED)' });
    }
    expect(linhas(s, 'addresses')).toHaveLength(2);
    expect(linhas(s, 'sync_operations').every((o) => o.sync_status === 'FAILED')).toBe(true);
  });

  test('não aceita os campos da validação (validado por, confiança, revisão…)', async () => {
    const s = cenario();
    const truques: Record<string, unknown>[] = [
      { validated_by: ADMIN },
      { validated_at: '2026-09-24T10:00:00Z' },
      { confidence_score: 100 },
      { flagged_for_review: false },
      { public_id: 'abc123' },
      { quadra_id: MORADA },
    ];
    for (const t of truques) {
      const [r] = await sincronizar('cidadao', { operation_type: 'create_address', payload: { ...MORADA_DO_SITE, ...t } });
      expect(r.status).toBe('FAILED');
      expect(r.error).toMatch(/so muda na validacao$/);
    }
    expect(linhas(s, 'addresses')).toHaveLength(2);
  });

  test('ignora o que não pode escolher: dono, id, origem e o ponto em texto (refeito a partir da latitude e longitude)', async () => {
    const s = cenario();
    await sincronizar('cidadao', {
      operation_type: 'create_address',
      payload: { ...MORADA_DO_SITE, created_by: OUTRO, id: MORADA, source: 'oficial', location: 'SRID=4326;POINT(0 0)' },
    });
    const nova = linhas(s, 'addresses')[2];
    expect(nova).toMatchObject({ created_by: CIDADAO, source: 'app', location: 'SRID=4326;POINT(15.7392 -12.7761)' });
    expect(nova.id).not.toBe(MORADA);
  });

  test('sem latitude e longitude válidas, ou com tipos errados, falha', async () => {
    cenario();
    const casos = [
      { ...MORADA_DO_SITE, latitude: undefined, longitude: undefined },
      { ...MORADA_DO_SITE, latitude: 200 },
      { ...MORADA_DO_SITE, latitude: '-12.7' },
      { ...MORADA_DO_SITE, street_id: "'; drop table" },
      { ...MORADA_DO_SITE, reference: 'x'.repeat(501) },
    ];
    for (const payload of casos) {
      const [r] = await sincronizar('cidadao', { operation_type: 'create_address', payload });
      expect(r.status).toBe('FAILED');
    }
  });
});

describe('sync v8: update_address', () => {
  test('quem criou pode corrigir a morada enquanto está por validar', async () => {
    const s = cenario();
    const [r] = await sincronizar('cidadao', {
      operation_type: 'update_address',
      payload: { id: MORADA, reference: 'Casa azul', street_id: RUA, based_on_updated_at: '2026-09-20T10:00:00.000Z' },
    });
    expect(r.status).toBe('SYNCED');
    expect(morada(s, MORADA)).toMatchObject({ reference: 'Casa azul', street_id: RUA, status: 'PROPOSED' });
  });

  test('ninguém muda o estado pela sync: nem quem criou, nem um administrador', async () => {
    const s = cenario();
    for (const token of ['cidadao', 'admin']) {
      const [r] = await sincronizar(token, { operation_type: 'update_address', payload: { id: MORADA, status: 'APPROVED' } });
      expect(r).toMatchObject({ status: 'FAILED', error: 'o estado da morada so muda na validacao' });
    }
    const [r] = await sincronizar('admin', { operation_type: 'update_address', payload: { id: MORADA, validated_by: ADMIN } });
    expect(r.status).toBe('FAILED');
    expect(morada(s, MORADA)).toMatchObject({ status: 'PROPOSED' });
    expect(morada(s, MORADA).validated_by).toBeUndefined();
  });

  test('depois de aprovada, quem criou já não a muda pela sync; outra pessoa nunca', async () => {
    const s = cenario();
    let [r] = await sincronizar('cidadao', { operation_type: 'update_address', payload: { id: MORADA_APROVADA, reference: 'Mudada' } });
    expect(r).toMatchObject({ status: 'FAILED', error: 'nao autorizado a editar esta morada' });
    [r] = await sincronizar('outro', { operation_type: 'update_address', payload: { id: MORADA, reference: 'Mudada' } });
    expect(r).toMatchObject({ status: 'FAILED', error: 'nao autorizado a editar esta morada' });
    expect(morada(s, MORADA_APROVADA).reference).toBe('Aprovada');
    expect(morada(s, MORADA).reference).toBe('Antiga');
  });

  test('administrador: conflito se a morada aprovada mudou desde que ficou sem rede; senão corrige (sem mexer no estado)', async () => {
    const s = cenario();
    let [r] = await sincronizar('admin', {
      operation_type: 'update_address',
      payload: { id: MORADA_APROVADA, reference: 'Nova', based_on_updated_at: '2026-09-19T10:00:00.000Z' },
    });
    expect(r.status).toBe('CONFLICT');
    expect(morada(s, MORADA_APROVADA).reference).toBe('Aprovada');
    [r] = await sincronizar('admin', {
      operation_type: 'update_address',
      payload: { id: MORADA_APROVADA, reference: 'Nova', based_on_updated_at: '2026-09-20T10:00:00.000Z' },
    });
    expect(r.status).toBe('SYNCED');
    expect(morada(s, MORADA_APROVADA)).toMatchObject({ reference: 'Nova', status: 'APPROVED' });
  });

  test('id inválido ou morada que não existe falham', async () => {
    cenario();
    const [a, b] = await sincronizar(
      'cidadao',
      { operation_type: 'update_address', payload: { id: 'x', reference: 'a' } },
      { operation_type: 'update_address', payload: { id: 'bbbbbbbb-0000-4000-8000-000000000099', reference: 'a' } },
    );
    expect(a).toMatchObject({ status: 'FAILED', error: 'id da morada invalido' });
    expect(b).toMatchObject({ status: 'FAILED', error: 'morada nao encontrada' });
  });
});

describe('sync v8: create_favorite', () => {
  test('o favorito é sempre de quem sincroniza, só com morada, categoria e nome', async () => {
    const s = cenario();
    const [r] = await sincronizar('cidadao', {
      operation_type: 'create_favorite',
      payload: { address_id: MORADA, category: 'casa', label: 'Casa da mãe', user_id: OUTRO, id: 'x' },
    });
    expect(r.status).toBe('SYNCED');
    const fav = linhas(s, 'favorites')[0];
    expect(fav).toMatchObject({ address_id: MORADA, category: 'casa', label: 'Casa da mãe', user_id: CIDADAO });
    expect(fav.id).not.toBe('x');
  });
});

describe('sync v8: operações e reencaminhamento', () => {
  test('uma operação com o operation_id de outra pessoa nunca é tocada', async () => {
    const s = cenario();
    const id = opId();
    s.tabelas().sync_operations = [{ operation_id: id, user_id: OUTRO, sync_status: 'FAILED', operation_type: 'create_address' }];
    const [r] = await sincronizar('cidadao', { operation_id: id, operation_type: 'create_address', payload: MORADA_DO_SITE });
    expect(r).toEqual({ operation_id: id, status: 'FAILED', error: 'esta operacao pertence a outra pessoa' });
    expect(linhas(s, 'sync_operations')).toEqual([expect.objectContaining({ user_id: OUTRO, sync_status: 'FAILED' })]);
    expect(linhas(s, 'addresses')).toHaveLength(2);
  });

  test('a mesma operação não é aplicada duas vezes', async () => {
    const s = cenario();
    const id = opId();
    await sincronizar('cidadao', { operation_id: id, operation_type: 'create_address', payload: MORADA_DO_SITE });
    const [r] = await sincronizar('cidadao', { operation_id: id, operation_type: 'create_address', payload: MORADA_DO_SITE });
    expect(r).toMatchObject({ status: 'SYNCED', note: 'ja tinha sido sincronizada antes' });
    expect(linhas(s, 'addresses')).toHaveLength(3);
  });

  test('field_submit, create_delivery e delivery_proof vão para a função certa, com a sessão de quem pede', async () => {
    cenario();
    const fetchFalso = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
    const r = await sincronizar(
      'cidadao',
      { operation_type: 'field_submit', payload: { a: 1 } },
      { operation_type: 'create_delivery', payload: { b: 2 } },
      { operation_type: 'delivery_proof', payload: { c: 3 } },
    );
    expect(r.map((x) => x.status)).toEqual(['SYNCED', 'SYNCED', 'SYNCED']);
    expect(fetchFalso.mock.calls.map((c) => c[0])).toEqual([
      `${URL_SUPABASE_FALSO}/functions/v1/field-service?action=submit`,
      `${URL_SUPABASE_FALSO}/functions/v1/deliveries?action=create`,
      `${URL_SUPABASE_FALSO}/functions/v1/deliveries?action=update_status`,
    ]);
    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cidadao');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  test('o erro da função de destino volta como FAILED (ex.: PIN errado)', async () => {
    cenario();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: 'PIN de confirmacao incorreto (restam 4 tentativas)' })));
    const [r] = await sincronizar('cidadao', { operation_type: 'delivery_proof', payload: {} });
    expect(r).toMatchObject({ status: 'FAILED', error: 'PIN de confirmacao incorreto (restam 4 tentativas)' });
  });

  test('tipo desconhecido e operation_id inválido falham; sem sessão 401', async () => {
    cenario();
    const [a] = await sincronizar('cidadao', { operation_type: 'apagar_tudo', payload: {} });
    expect(a).toMatchObject({ status: 'FAILED', error: 'operation_type desconhecido: apagar_tudo' });
    const [b] = await sincronizar('cidadao', { operation_id: 'nao-e-uuid', operation_type: 'create_address', payload: MORADA_DO_SITE });
    expect(b).toMatchObject({ status: 'FAILED', error: 'operation_id invalido' });
    expect((await pedir(handler, null, { operations: [] }, 'cidadao')).status).toBe(400);
    expect((await pedir(handler, null, { operations: [] }, null)).status).toBe(401);
  });
});

describe('sync v8: regras puras', () => {
  test('limparMoradaNova força PROPOSED e o dono', () => {
    const r = limparMoradaNova(MORADA_DO_SITE, CIDADAO);
    expect(r).toMatchObject({ ok: true, linha: { status: ESTADO_INICIAL, created_by: CIDADAO } });
    expect(limparMoradaNova(null, CIDADAO)).toEqual({ ok: false, erro: 'payload invalido' });
    expect(limparMoradaNova([], CIDADAO)).toEqual({ ok: false, erro: 'payload invalido' });
  });

  test('limparEdicaoMorada: precisa de algo para mudar; latitude e longitude refazem o ponto', () => {
    expect(limparEdicaoMorada({})).toEqual({ ok: false, erro: 'nada para mudar' });
    expect(limparEdicaoMorada({ latitude: 1, longitude: 2 })).toEqual({
      ok: true,
      linha: { latitude: 1, longitude: 2, location: 'SRID=4326;POINT(2 1)' },
    });
    expect(limparEdicaoMorada({ latitude: 1 })).toMatchObject({ ok: false });
  });

  test('limparFavorito exige o id da morada', () => {
    expect(limparFavorito({ category: 'casa' }, CIDADAO)).toEqual({ ok: false, erro: 'address_id invalido' });
  });

  test('podeEditarMorada', () => {
    expect(podeEditarMorada({ created_by: CIDADAO, status: 'PROPOSED' }, CIDADAO, false)).toBe(true);
    expect(podeEditarMorada({ created_by: CIDADAO, status: 'APPROVED' }, CIDADAO, false)).toBe(false);
    expect(podeEditarMorada({ created_by: OUTRO, status: 'PROPOSED' }, CIDADAO, false)).toBe(false);
    expect(podeEditarMorada({ created_by: OUTRO, status: 'APPROVED' }, ADMIN, true)).toBe(true);
  });

  test('os campos proibidos incluem tudo o que a validação grava', () => {
    expect(CAMPOS_PROIBIDOS).toEqual(expect.arrayContaining(['validated_by', 'validated_at', 'confidence_score', 'flagged_for_review']));
  });

  test('a v8 não tem chaves escritas no código', () => {
    const codigo = readFileSync(join(__dirname, '..', '..', 'supabase', 'functions', 'sync', 'index.ts'), 'utf8');
    expect(codigo).not.toMatch(/sb_publishable_|eyJhbGci/);
    expect(codigo).toMatch(/Deno\.env\.get\("SUPABASE_ANON_KEY"\)/);
  });
});

describe('moradas pela API direta (migração 20260924070000)', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260924070000_moradas_so_por_validar.sql'), 'utf8');

  test('criar diretamente só por validar, em nome de quem cria e sem os campos da validação', () => {
    const politica = sql.slice(sql.indexOf('create policy "Criar morada própria"'));
    for (const regra of [
      'created_by = (select auth.uid())',
      "status = 'PROPOSED'",
      'validated_by is null',
      'validated_at is null',
      'confidence_score is null',
      'coalesce(flagged_for_review, false) = false',
    ]) {
      expect(politica).toContain(regra);
    }
  });

  test('ninguém muda moradas diretamente', () => {
    expect(sql).toContain('drop policy if exists "Editar morada própria enquanto proposta" on public.addresses;');
    expect(sql).toContain('revoke update, truncate on public.addresses from anon, authenticated;');
  });
});
