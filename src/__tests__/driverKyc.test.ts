/**
 * @jest-environment node
 */
// A Edge Function "driver-kyc" (v4) a correr de verdade, com um Supabase falso.
import { describe, expect, jest, test } from '@jest/globals';

import { limparCandidatura, paisDaConta, posicaoValida } from '../../supabase/functions/driver-kyc/regras';
import { carregarFuncao, criarSupabaseFalso, pedir } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/driver-kyc/index.ts');
  });
});

const MOTORISTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000002';

const fotos = (uid: string) => ({
  id_document_path: `${uid}/driver/id-1.jpg`,
  license_front_path: `${uid}/driver/carta-frente-1.jpg`,
  license_back_path: `${uid}/driver/carta-verso-1.jpg`,
  vehicle_document_path: `${uid}/driver/livrete-1.jpg`,
  selfie_path: `${uid}/driver/selfie-1.jpg`,
});
const CANDIDATURA = { vehicle_type: 'mota', vehicle_plate: 'ld-12-34-ab', license_number: 'C123', vehicle_capacity_kg: '40', ...fotos(MOTORISTA) };

function cenario(tabelas: Record<string, any[]> = {}) {
  const s = criarSupabaseFalso({
    sessoes: { motorista: MOTORISTA, admin: ADMIN },
    emails: { [MOTORISTA]: 'motorista@exemplo.ao' },
    tabelas: { organization_members: [{ user_id: ADMIN, role: 'admin_nacional' }], ...tabelas },
    rpc: { is_admin: ({ check_user_id }, t) => (t.organization_members ?? []).some((m: any) => m.user_id === check_user_id) },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

describe('driver-kyc: regras puras', () => {
  test('país: perfil, senão o do registo, senão Angola', () => {
    expect(paisDaConta('mz', null)).toBe('MZ');
    expect(paisDaConta(null, { country_code: 'cv' })).toBe('CV');
    expect(paisDaConta(null, { country_code: 'PT' })).toBe('AO');
    expect(paisDaConta(undefined, undefined)).toBe('AO');
  });

  test('candidatura: fotos só na pasta de quem se candidata; matrícula em maiúsculas', () => {
    expect(limparCandidatura({ ...CANDIDATURA, selfie_path: 'outro/selfie.jpg' }, MOTORISTA)).toEqual({ ok: false, erro: 'FICHEIRO_KYC_FORA_DA_PASTA_DO_UTILIZADOR' });
    expect(limparCandidatura({ ...CANDIDATURA, selfie_path: `${MOTORISTA}/../x.jpg` }, MOTORISTA).ok).toBe(false);
    expect(limparCandidatura({ ...CANDIDATURA, vehicle_type: ' ' }, MOTORISTA)).toEqual({ ok: false, erro: 'DADOS_KYC_INCOMPLETOS' });
    expect(limparCandidatura({ ...CANDIDATURA, vehicle_capacity_kg: -1 }, MOTORISTA)).toEqual({ ok: false, erro: 'CAPACIDADE_INVALIDA' });
    const r = limparCandidatura(CANDIDATURA, MOTORISTA);
    expect(r.ok && r.linha).toMatchObject({ vehicle_plate: 'LD-12-34-AB', vehicle_capacity_kg: 40, license_expiry: null });
  });

  test('posição: só números válidos', () => {
    expect(posicaoValida(-12.7, 15.7)).toEqual({ latitude: -12.7, longitude: 15.7 });
    expect(posicaoValida(0, 0)).toBeNull();
    expect(posicaoValida('1', 2)).toBeNull();
  });
});

describe('driver-kyc: do envio à aprovação', () => {
  test('sem perfil de país: cria-o (Angola) e a candidatura fica em revisão; não se reenvia em revisão', async () => {
    const s = cenario();
    const r = await pedir(handler, 'submit', CANDIDATURA, 'motorista');
    expect(r.status).toBe(200);
    expect(s.tabelas().user_country_profiles).toEqual([expect.objectContaining({ user_id: MOTORISTA, country_code: 'AO' })]);
    expect(s.tabelas().driver_applications[0]).toMatchObject({ user_id: MOTORISTA, status: 'PENDING_REVIEW', country_code: 'AO', vehicle_capacity_kg: 40 });
    expect((await pedir(handler, 'submit', CANDIDATURA, 'motorista')).status).toBe(409);
  });

  test('só administradores listam, veem (com registo) e decidem; ninguém decide a própria', async () => {
    const s = cenario({ driver_applications: [{ id: 'app-1', user_id: MOTORISTA, status: 'PENDING_REVIEW', country_code: 'AO', vehicle_type: 'mota', vehicle_plate: 'X', vehicle_capacity_kg: 40, ...fotos(MOTORISTA) }] });
    expect((await pedir(handler, 'list_pending', {}, 'motorista')).status).toBe(403);
    const lista = await pedir(handler, 'list_pending', {}, 'admin');
    expect(lista.json.applications).toEqual([expect.objectContaining({ user_id: MOTORISTA, email: 'motorista@exemplo.ao' })]);
    expect(JSON.stringify(lista.json)).not.toContain('selfie');

    const ver = await pedir(handler, 'view', { user_id: MOTORISTA }, 'admin');
    expect(ver.json.links.selfie_path).toBe(`https://assinado/kyc-artifacts/${MOTORISTA}/driver/selfie-1.jpg?s=600`);
    expect(s.tabelas().audit_logs).toEqual([expect.objectContaining({ action: 'driver_documents_viewed', actor_id: ADMIN })]);

    expect((await pedir(handler, 'review', { user_id: MOTORISTA, decision: 'approve' }, 'motorista')).status).toBe(403);
    expect((await pedir(handler, 'review', { user_id: MOTORISTA, decision: 'reject', reason: 'x' }, 'admin')).status).toBe(422);
    expect(await pedir(handler, 'review', { user_id: MOTORISTA, decision: 'approve' }, 'admin')).toEqual({ status: 200, json: { ok: true, status: 'APPROVED' } });
    expect(s.tabelas().driver_profiles[0]).toMatchObject({ user_id: MOTORISTA, status: 'APPROVED', online: false, vehicle_capacity_kg: 40 });
    expect(s.tabelas().notifications[0]).toMatchObject({ user_id: MOTORISTA, title: 'Candidatura de motorista aprovada' });
    expect((await pedir(handler, 'review', { user_id: MOTORISTA, decision: 'approve' }, 'admin')).status).toBe(409);
  });

  test('set_online só para motoristas aprovados; guarda a posição', async () => {
    const s = cenario({ driver_profiles: [{ user_id: MOTORISTA, status: 'PENDING', online: false }] });
    expect((await pedir(handler, 'set_online', { online: true }, 'motorista')).status).toBe(403);
    s.tabelas().driver_profiles[0].status = 'APPROVED';
    expect((await pedir(handler, 'set_online', { online: true, latitude: -12.7, longitude: 15.7 }, 'motorista')).json).toEqual({ ok: true, online: true });
    expect(s.tabelas().driver_profiles[0]).toMatchObject({ online: true, latitude: -12.7, longitude: 15.7 });
    await pedir(handler, 'set_online', { online: false }, 'motorista');
    expect(s.tabelas().driver_profiles[0].online).toBe(false);
  });
});
