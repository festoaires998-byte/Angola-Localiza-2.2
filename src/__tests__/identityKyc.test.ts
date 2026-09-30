/**
 * @jest-environment node
 */
// A Edge Function "identity-kyc" (v3): ficheiros só da pasta de quem envia.
import { describe, expect, jest, test } from '@jest/globals';

import { nomeNaPastaKyc } from '../../supabase/functions/identity-kyc/regras';
import { carregarFuncao, criarSupabaseFalso, pedir } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/identity-kyc/index.ts');
  });
});

const TECNICO = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002';

const pedido = (uid: string) => ({
  id_number: '008807453HO45',
  id_photo_url: `${uid}/bi-frente-1.jpg`,
  id_photo_back_url: `kyc-artifacts/${uid}/bi-verso-1.jpg`,
  video_url: `${uid}/video-1.webm`,
  video_duration_seconds: 10,
  challenge_sequence: ['sorri'],
});

function cenario(ficheirosEncontrados: number) {
  const s = criarSupabaseFalso({
    sessoes: { tecnico: TECNICO },
    tabelas: { user_identity: [], identity_verifications: [] },
    rpc: { kyc_artefactos_do_utilizador: () => ficheirosEncontrados },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

describe('identity-kyc v3', () => {
  test('regra: só a pasta de quem envia, sem ".."', () => {
    expect(nomeNaPastaKyc(`${TECNICO}/a.jpg`, TECNICO)).toBe(`${TECNICO}/a.jpg`);
    expect(nomeNaPastaKyc(`kyc-artifacts/${TECNICO}/a.jpg`, TECNICO)).toBe(`${TECNICO}/a.jpg`);
    expect(nomeNaPastaKyc(`${OUTRO}/a.jpg`, TECNICO)).toBeNull();
    expect(nomeNaPastaKyc('bi-frente-1.jpg', TECNICO)).toBeNull();
    expect(nomeNaPastaKyc(`${TECNICO}/../${OUTRO}/a.jpg`, TECNICO)).toBeNull();
  });

  test('recusa ficheiros de outra pessoa ou na raiz (403)', async () => {
    cenario(3);
    expect((await pedir(handler, 'submit_liveness', pedido(OUTRO), 'tecnico')).status).toBe(403);
    expect((await pedir(handler, 'submit_liveness', { ...pedido(TECNICO), video_url: 'video-1.webm' }, 'tecnico')).status).toBe(403);
  });

  test('os 3 ficheiros têm de existir no Storage, enviados por quem pede', async () => {
    cenario(2);
    expect((await pedir(handler, 'submit_liveness', pedido(TECNICO), 'tecnico')).status).toBe(422);
  });

  test('com os 3 ficheiros: fica em revisão e guarda os caminhos sem o prefixo do bucket', async () => {
    const s = cenario(3);
    const r = await pedir(handler, 'submit_liveness', pedido(TECNICO), 'tecnico');
    expect(r.status).toBe(200);
    expect(s.tabelas().identity_verifications[0]).toMatchObject({
      user_id: TECNICO,
      id_last4: 'HO45',
      id_photo_url: `${TECNICO}/bi-frente-1.jpg`,
      id_photo_back_url: `${TECNICO}/bi-verso-1.jpg`,
      video_url: `${TECNICO}/video-1.webm`,
    });
    expect(s.rpcsChamadas.find((c) => c.nome === 'kyc_artefactos_do_utilizador')?.args).toEqual({
      nomes: [`${TECNICO}/bi-frente-1.jpg`, `${TECNICO}/bi-verso-1.jpg`, `${TECNICO}/video-1.webm`],
      utilizador: TECNICO,
    });
  });

  test('revisão: só quem pode rever; nunca a própria; só pedidos por rever; recusa exige motivo', async () => {
    const REVISOR = 'aaaaaaaa-0000-4000-8000-000000000009';
    const s = criarSupabaseFalso({
      sessoes: { tecnico: TECNICO, revisor: REVISOR },
      tabelas: {
        organization_members: [{ user_id: REVISOR, role: 'admin_nacional' }, { user_id: TECNICO, role: 'super_admin' }],
        identity_verifications: [
          { id: 'v1', user_id: TECNICO, status: 'SUBMITTED' },
          { id: 'v2', user_id: OUTRO, status: 'APPROVED' },
        ],
        user_identity: [],
      },
    });
    (globalThis as any).__supabaseFalso = s;
    expect((await pedir(handler, 'review_decision', { verification_id: 'v1', decision: 'approve' }, 'tecnico')).status).toBe(403);
    expect((await pedir(handler, 'review_decision', { verification_id: 'v2', decision: 'approve' }, 'revisor')).status).toBe(409);
    expect((await pedir(handler, 'review_decision', { verification_id: 'v1', decision: 'reject' }, 'revisor')).status).toBe(422);
    expect((await pedir(handler, 'review_decision', { verification_id: 'v1', decision: 'talvez' }, 'revisor')).status).toBe(400);
    expect((await pedir(handler, 'review_decision', { verification_id: 'v1', decision: 'approve' }, 'revisor')).status).toBe(200);
    expect(s.tabelas().identity_verifications[0]).toMatchObject({ status: 'APPROVED', reviewed_by: REVISOR });
    expect(s.tabelas().user_identity[0]).toMatchObject({ user_id: TECNICO, status: 'ID_VERIFIED' });
  });
});
