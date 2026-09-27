/**
 * @jest-environment node
 */
// A Edge Function "deliveries" a correr de verdade (index.ts), com um Supabase
// falso em memória. O ambiente "node" dá Request, Response e crypto.subtle,
// como no Deno.
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { p256 } from '@noble/curves/nist.js';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  BUCKET_LEGADO,
  BUCKET_PROVAS,
  diferencaNaMensagem,
  ficheiroDaProva,
  gerarPin,
  podeUsarComoDestino,
  respostaPin,
  validarFicheirosProva,
} from '../../supabase/functions/deliveries/regras';
import { criarAssinarProva, paraCamposProva, type DadosProva } from '@/services/crypto/assinarProva';
import { chavePublicaParaJwk } from '@/services/crypto/jwk';
import { sha256Hex } from '@/services/imagem/hashFoto';
import { carregarFuncao, criarSupabaseFalso, pedir, URL_SUPABASE_FALSO, type SupabaseFalso } from '@/testes/supabaseFalso';

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
const PRIVADA_DE_OUTRO = 'bbbbbbbb-0000-4000-8000-000000000002';
const PRIVADA_MINHA = 'bbbbbbbb-0000-4000-8000-000000000003';
const PRIVADA_NOS_FAVORITOS = 'bbbbbbbb-0000-4000-8000-000000000004';
const POR_VALIDAR_DE_OUTRO = 'bbbbbbbb-0000-4000-8000-000000000005';
const ENTREGA = 'cccccccc-0000-4000-8000-000000000001';

const TOKENS: Record<string, string> = { remetente: REMETENTE, estafeta: ESTAFETA, admin: ADMIN, outro: OUTRO, super: SUPER };

const FUTURO = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const PASSADO = new Date(Date.now() - 3600 * 1000).toISOString();

// Ficheiros da prova: a app envia para delivery-proofs/<id do estafeta>/…; o site para field-photos.
const FOTO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const ASSINATURA_BYTES = new Uint8Array([9, 8, 7]);
const FOTO = `${BUCKET_PROVAS}/${ESTAFETA}/pod-1790000000000.jpg`;
const ASSINATURA = `${BUCKET_PROVAS}/${ESTAFETA}/assinatura-1790000000000.png`;
const FOTO_SITE = `${URL_SUPABASE_FALSO}/storage/v1/object/public/${BUCKET_LEGADO}/pod-1790000000000.jpg`;
const ASSINATURA_SITE = `${URL_SUPABASE_FALSO}/storage/v1/object/public/${BUCKET_LEGADO}/assinatura-1790000000000.jpg`;

/** Ficheiros no Storage e de quem são (como storage.objects.owner). */
const OBJETOS: { bucket: string; nome: string; dono: string; bytes: Uint8Array }[] = [
  { bucket: BUCKET_PROVAS, nome: `${ESTAFETA}/pod-1790000000000.jpg`, dono: ESTAFETA, bytes: FOTO_BYTES },
  { bucket: BUCKET_PROVAS, nome: `${ESTAFETA}/assinatura-1790000000000.png`, dono: ESTAFETA, bytes: ASSINATURA_BYTES },
  { bucket: BUCKET_PROVAS, nome: `${OUTRO}/pod-1790000000000.jpg`, dono: OUTRO, bytes: FOTO_BYTES },
  { bucket: BUCKET_LEGADO, nome: 'pod-1790000000000.jpg', dono: ESTAFETA, bytes: FOTO_BYTES },
  { bucket: BUCKET_LEGADO, nome: 'assinatura-1790000000000.jpg', dono: ESTAFETA, bytes: ASSINATURA_BYTES },
];

function cenario(entrega: Record<string, unknown> = {}) {
  const ficheiros: Record<string, Record<string, Uint8Array>> = {};
  for (const o of OBJETOS) (ficheiros[o.bucket] ??= {})[o.nome] = o.bytes;
  const s = criarSupabaseFalso({
    sessoes: TOKENS,
    ficheiros,
    tabelas: {
      organization_members: [
        { user_id: ESTAFETA, role: 'estafeta', organization_id: 'org-1' },
        { user_id: ADMIN, role: 'admin_nacional', organization_id: 'org-1' },
        { user_id: SUPER, role: 'super_admin', organization_id: 'org-1' },
      ],
      user_identity: [
        { user_id: REMETENTE, status: null, citizen_id_verified: true },
        { user_id: OUTRO, status: null, citizen_id_verified: false },
        { user_id: ESTAFETA, status: 'ID_VERIFIED', citizen_id_verified: false },
      ],
      addresses: [
        { id: MORADA, status: 'APPROVED', visibility_level: 'PUBLIC', created_by: OUTRO, confidence_score: 50, flagged_for_review: false },
        { id: PRIVADA_DE_OUTRO, status: 'APPROVED', visibility_level: 'PRIVATE', created_by: OUTRO },
        { id: PRIVADA_MINHA, status: 'APPROVED', visibility_level: 'PRIVATE', created_by: REMETENTE },
        { id: PRIVADA_NOS_FAVORITOS, status: 'APPROVED', visibility_level: 'PRIVATE', created_by: OUTRO },
        { id: POR_VALIDAR_DE_OUTRO, status: 'PROPOSED', visibility_level: 'PUBLIC', created_by: OUTRO },
      ],
      favorites: [{ id: 'fav-1', user_id: REMETENTE, address_id: PRIVADA_NOS_FAVORITOS }],
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
          pin_failed_attempts: 0,
          zone_code: null,
          payer_organization_id: null,
          ...entrega,
        },
      ],
      pricing_zones: [{ zone_code: 'Z1', base_fee: 1000, routing_fee: 200, proof_fee: 100 }],
    },
    predefinicoes: {
      deliveries: () => ({
        tracking_code: 'NOVO123456',
        status: 'CREATED',
        confirmation_pin: '1234',
        confirmation_pin_expires_at: FUTURO,
        pin_failed_attempts: 0,
      }),
    },
    // O mesmo que as funções SQL (a migração 20260924060000 e o is_admin).
    rpc: {
      is_admin: ({ check_user_id }, t) =>
        t.organization_members.some(
          (m) => m.user_id === check_user_id && ['super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal'].includes(m.role),
        ),
      is_id_verified: ({ check_user_id }, t) => t.user_identity.some((u) => u.user_id === check_user_id && u.status === 'ID_VERIFIED'),
      ficheiros_da_prova: ({ nomes, buckets, utilizador }: { nomes: string[]; buckets: string[]; utilizador: string }) =>
        new Set(
          nomes
            .map((n, i) => `${buckets[i]}|${n}`)
            .filter((k) => OBJETOS.some((o) => `${o.bucket}|${o.nome}` === k && o.dono === utilizador)),
        ).size,
      aplicar_transicao_entrega_com_prova: (args: any, t) => {
        const d = t.deliveries.find((x) => x.id === args.p_delivery_id);
        if (!d) throw new Error('DELIVERY_NOT_FOUND');
        if (args.p_sync_operation_id) {
          const existing = (t.delivery_proofs ?? []).find((p) => p.sync_operation_id === args.p_sync_operation_id);
          if (existing) return [{ applied: false, proof_id: existing.id, final_status: d.status }];
        }
        if (d.status !== args.p_expected_status) throw new Error('DELIVERY_STATE_CHANGED');
        d.status = args.p_new_status;
        d.updated_at = new Date().toISOString();
        (t.delivery_status_history ??= []).push({ id: 'history-' + Date.now() + '-' + Math.random(), delivery_id: d.id, status: args.p_new_status });
        let proofId: string | null = null;
        if (args.p_proof) {
          proofId = 'proof-' + Date.now() + '-' + Math.random();
          (t.delivery_proofs ??= []).push({ id: proofId, delivery_id: d.id, sync_operation_id: args.p_sync_operation_id ?? null, ...args.p_proof });
        }
        return [{ applied: true, proof_id: proofId, final_status: args.p_new_status }];
      },
      verificar_pin_entrega: ({ p_delivery_id, p_pin }: { p_delivery_id: string; p_pin: string | null }, t) => {
        const d = t.deliveries.find((x) => x.id === p_delivery_id);
        if (!d) return { resultado: 'NOT_FOUND' };
        if (d.pin_failed_attempts >= 5) return { resultado: 'LOCKED', restantes: 0 };
        if (d.confirmation_pin_expires_at && d.confirmation_pin_expires_at < new Date().toISOString()) return { resultado: 'EXPIRED' };
        if (p_pin !== null && p_pin === d.confirmation_pin) return { resultado: 'OK' };
        d.pin_failed_attempts += 1;
        return d.pin_failed_attempts >= 5 ? { resultado: 'LOCKED', restantes: 0 } : { resultado: 'WRONG', restantes: 5 - d.pin_failed_attempts };
      },
    },
  });
  (globalThis as any).__supabaseFalso = s;
  return s;
}

const linhas = (s: SupabaseFalso, t: string) => s.tabelas()[t] ?? [];
const entrega = (s: SupabaseFalso) => linhas(s, 'deliveries').find((d) => d.id === ENTREGA)!;
const fechar = (extra: Record<string, unknown> = {}, proof: Record<string, unknown> = {}, token = 'estafeta') =>
  pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof: { photo_url: FOTO, signature_url: ASSINATURA, ...proof }, ...extra }, token);

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

  test('v19: só quem tem a identidade verificada (cidadão ou pessoal) cria entregas', async () => {
    const s = cenario();
    const semVerificacao = await pedir(handler, 'create', { address_id: MORADA, recipient_name: 'Ana' }, 'outro');
    expect(semVerificacao.status).toBe(403);
    expect(semVerificacao.json.error).toMatch(/^CITIZEN_ID_NOT_VERIFIED/);
    // Sem linha em user_identity também não.
    expect((await pedir(handler, 'create', { address_id: MORADA, recipient_name: 'Ana' }, 'admin')).status).toBe(403);
    // Pessoal com a identidade verificada (ID_VERIFIED) pode.
    expect((await pedir(handler, 'create', { address_id: MORADA, recipient_name: 'Ana' }, 'estafeta')).status).toBe(200);
    expect(linhas(s, 'deliveries')).toHaveLength(2);
  });

  test('v20: o destino tem de ser uma morada que quem cria pode ver', async () => {
    const s = cenario();
    const criar = (address_id: string, quem = 'remetente') => pedir(handler, 'create', { address_id, recipient_name: 'Ana' }, quem);

    // Privada de outra pessoa, por validar de outra pessoa, ou inexistente: recusado, sem devolver a morada.
    for (const id of [PRIVADA_DE_OUTRO, POR_VALIDAR_DE_OUTRO, 'bbbbbbbb-0000-4000-8000-00000000ffff']) {
      const r = await criar(id);
      expect(r.status).toBe(403);
      expect(r.json.error).toMatch(/^DESTINO_NAO_PERMITIDO/);
      expect(JSON.stringify(r.json)).not.toMatch(/latitude|reference/);
    }
    expect(linhas(s, 'deliveries')).toHaveLength(1);

    // Pública, privada minha, ou privada que já está nos meus favoritos: aceite.
    expect((await criar(MORADA)).status).toBe(200);
    expect((await criar(PRIVADA_MINHA)).status).toBe(200);
    expect((await criar(PRIVADA_NOS_FAVORITOS)).status).toBe(200);
    expect(linhas(s, 'deliveries')).toHaveLength(4);
  });

  test('v20: regra do destino (pura)', () => {
    const privada = { status: 'APPROVED', visibility_level: 'PRIVATE', created_by: OUTRO };
    expect(podeUsarComoDestino(null, REMETENTE, true, true)).toBe(false);
    expect(podeUsarComoDestino({ status: 'OFFICIAL', visibility_level: 'LIMITED', created_by: OUTRO }, REMETENTE, false, false)).toBe(true);
    expect(podeUsarComoDestino(privada, REMETENTE, false, false)).toBe(false);
    expect(podeUsarComoDestino({ ...privada, created_by: REMETENTE }, REMETENTE, false, false)).toBe(true);
    expect(podeUsarComoDestino(privada, REMETENTE, true, false)).toBe(true);
    expect(podeUsarComoDestino(privada, REMETENTE, false, true)).toBe(true);
    expect(podeUsarComoDestino({ status: 'PROPOSED', visibility_level: 'PUBLIC', created_by: OUTRO }, REMETENTE, false, false)).toBe(false);
  });

  test('cria a entrega em nome de quem pede, com histórico, cobrança da zona e registo; devolve o PIN a quem criou', async () => {
    const s = cenario();
    const r = await pedir(
      handler,
      'create',
      { address_id: MORADA, recipient_name: 'Ana', recipient_phone: '+244 923 456 789', zone_code: 'Z1', created_by: OUTRO, status: 'DELIVERED' },
      'remetente',
    );
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ created_by: REMETENTE, status: 'CREATED', recipient_phone: '+244 923 456 789', confirmation_pin: '1234' });
    expect(linhas(s, 'delivery_status_history')).toEqual([expect.objectContaining({ delivery_id: r.json.id, status: 'CREATED' })]);
    expect(linhas(s, 'usage_events')).toEqual([
      expect.objectContaining({ event_type: 'DELIVERY_ROUTED', amount_total: 1560, amount_driver: 1000, is_free_pilot: true }),
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

  test('v19: só se atribui a quem é estafeta', async () => {
    const s = cenario({ status: 'CREATED', assigned_driver: null });
    const r = await pedir(handler, 'assign_driver', { delivery_id: ENTREGA, driver_id: OUTRO }, 'remetente');
    expect(r).toEqual({ status: 422, json: { error: 'essa pessoa nao e estafeta' } });
    expect((await pedir(handler, 'assign_driver', { delivery_id: ENTREGA }, 'remetente')).status).toBe(400);
    expect(entrega(s)).toMatchObject({ status: 'CREATED', assigned_driver: null });
  });

  test('v19: quem criou a entrega (e vê o PIN) não pode ser o estafeta dela', async () => {
    const s = cenario({ status: 'CREATED', assigned_driver: null, created_by: ESTAFETA });
    const r = await pedir(handler, 'assign_driver', { delivery_id: ENTREGA, driver_id: ESTAFETA }, 'admin');
    expect(r).toEqual({ status: 422, json: { error: 'quem cria a entrega nao pode ser o estafeta dela' } });
    expect(entrega(s).status).toBe('CREATED');
  });
});

describe('deliveries: mudar de estado', () => {
  test('só o estafeta, um administrador ou quem criou (para cancelar)', async () => {
    const s = cenario();
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'recusa' }, 'outro')).status).toBe(403);
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'recusa' }, 'remetente')).status).toBe(403);
    expect(entrega(s).status).toBe('OUT_FOR_DELIVERY');
  });

  test('segue as etapas: não salta de OUT_FOR_DELIVERY para PICKED_UP', async () => {
    cenario();
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'PICKED_UP', proof: { photo_url: FOTO } }, 'estafeta');
    expect(r).toEqual({ status: 400, json: { error: 'transicao invalida: OUT_FOR_DELIVERY -> PICKED_UP' } });
  });

  test('a recolha exige foto (da app ou do site)', async () => {
    const s = cenario({ status: 'ASSIGNED' });
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'PICKED_UP' }, 'estafeta')).status).toBe(422);
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'PICKED_UP', proof: { photo_url: FOTO_SITE } }, 'estafeta');
    expect(r.status).toBe(200);
    expect(linhas(s, 'delivery_proofs')).toEqual([expect.objectContaining({ proof_type: 'PICKUP', photo_url: FOTO_SITE })]);
  });

  test('a falha exige um motivo da lista; marca a morada para revisão e avisa quem a registou', async () => {
    const s = cenario();
    expect((await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'chuva' }, 'estafeta')).status).toBe(400);
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'FAILED', reason: 'morada_nao_encontrada' }, 'estafeta');
    expect(r.status).toBe(200);
    expect(linhas(s, 'addresses')[0]).toMatchObject({ flagged_for_review: true, confidence_score: 35 });
    expect(linhas(s, 'notifications')).toEqual([expect.objectContaining({ user_id: OUTRO, entity_id: MORADA })]);
  });

  test('v19: se o estado mudou entretanto (outro pedido ao mesmo tempo), não grava e responde 409', async () => {
    const s = cenario({ status: 'IN_TRANSIT' });
    // Simula a corrida: entre a leitura e a escrita, outro pedido já mudou o estado.
    const rpc = s.cliente.rpc;
    s.cliente.rpc = (nome: string, args: any) => {
      if (nome === 'aplicar_transicao_entrega_com_prova') {
        entrega(s).status = 'CANCELLED';
        return Promise.resolve({ data: null, error: { message: 'DELIVERY_STATE_CHANGED' } });
      }
      return rpc(nome, args);
    };
    const r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'OUT_FOR_DELIVERY' }, 'estafeta');
    expect(r.status).toBe(409);
    expect(entrega(s).status).toBe('CANCELLED');
    expect(linhas(s, 'delivery_status_history')).toEqual([]);
  });
});

describe('deliveries v19: fechar a entrega exige PIN, foto e assinatura desenhada', () => {
  test('sem foto ou sem assinatura: 422 e a entrega fica como estava', async () => {
    const s = cenario();
    let r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof: { signature_url: ASSINATURA } }, 'estafeta');
    expect(r).toEqual({ status: 422, json: { error: 'POD_INCOMPLETA: falta a foto da entrega' } });
    r = await pedir(handler, 'update_status', { delivery_id: ENTREGA, new_status: 'DELIVERED', pin: '4821', proof: { photo_url: FOTO } }, 'estafeta');
    expect(r).toEqual({ status: 422, json: { error: 'POD_INCOMPLETA: falta a assinatura de quem recebe' } });
    expect(entrega(s)).toMatchObject({ status: 'OUT_FOR_DELIVERY', pin_failed_attempts: 0 });
  });

  test('ficheiros de fora, na pasta de outra pessoa ou que não existem são recusados (sem gastar tentativas)', async () => {
    const s = cenario();
    expect((await fechar({}, { photo_url: 'https://outro-site.com/f.jpg' })).status).toBe(422);
    expect((await fechar({}, { photo_url: `${BUCKET_PROVAS}/${OUTRO}/pod-1790000000000.jpg` })).status).toBe(403);
    expect((await fechar({}, { photo_url: `${BUCKET_PROVAS}/${ESTAFETA}/nao-existe-1.jpg` })).status).toBe(422);
    expect(entrega(s)).toMatchObject({ status: 'OUT_FOR_DELIVERY', pin_failed_attempts: 0 });
  });

  test('PIN certo com foto e assinatura: fecha, grava a prova (caminho no bucket privado) e o registo', async () => {
    const s = cenario();
    const r = await fechar();
    expect(r).toEqual({ status: 200, json: { ok: true, status: 'DELIVERED', crypto_verified: null } });
    expect(entrega(s).status).toBe('DELIVERED');
    expect(linhas(s, 'delivery_proofs')).toEqual([
      expect.objectContaining({ proof_type: 'POD', created_by: ESTAFETA, photo_url: FOTO, signature_url: ASSINATURA, crypto_verified: null }),
    ]);
    expect(linhas(s, 'audit_logs')).toEqual([
      expect.objectContaining({ action: 'delivery_delivered_with_pod', after: expect.objectContaining({ has_photo: true, has_signature: true }) }),
    ]);
  });

  test('o site antigo continua a funcionar com as fotos em field-photos (transição)', async () => {
    const s = cenario();
    expect((await fechar({}, { photo_url: FOTO_SITE, signature_url: ASSINATURA_SITE })).status).toBe(200);
    expect(linhas(s, 'delivery_proofs')[0]).toMatchObject({ photo_url: FOTO_SITE, signature_url: ASSINATURA_SITE });
  });

  test('PIN errado conta tentativas; à 5.ª fica bloqueado, mesmo com o PIN certo', async () => {
    const s = cenario();
    for (let i = 1; i <= 4; i++) {
      const r = await fechar({ pin: '0000' });
      expect(r).toEqual({ status: 400, json: { error: `PIN de confirmacao incorreto (restam ${5 - i} tentativas)` } });
    }
    expect((await fechar({ pin: '0000' })).status).toBe(423);
    expect((await fechar()).status).toBe(423);
    expect(entrega(s)).toMatchObject({ status: 'OUT_FOR_DELIVERY', pin_failed_attempts: 5 });
    expect(linhas(s, 'delivery_proofs')).toEqual([]);
  });

  test('PIN em falta conta como errado; PIN expirado responde 410', async () => {
    let s = cenario();
    expect((await fechar({ pin: undefined })).status).toBe(400);
    expect(entrega(s).pin_failed_attempts).toBe(1);
    s = cenario({ confirmation_pin_expires_at: PASSADO });
    expect((await fechar()).status).toBe(410);
    expect(entrega(s).status).toBe('OUT_FOR_DELIVERY');
  });

  test('a v19 já não lê o PIN nem a validade na leitura da entrega (só a função SQL confere)', () => {
    const codigo = readFileSync(join(__dirname, '..', '..', 'supabase', 'functions', 'deliveries', 'index.ts'), 'utf8');
    const trecho = codigo.slice(codigo.indexOf('action === "update_status"'));
    expect(trecho).not.toMatch(/confirmation_pin/);
    expect(trecho).toMatch(/rpc\("verificar_pin_entrega"/);
  });
});

describe('deliveries v19: o PIN só para quem criou', () => {
  test('get_pin: só quem criou, e só enquanto a entrega não terminou', async () => {
    cenario();
    expect((await pedir(handler, 'get_pin', { delivery_id: ENTREGA }, 'estafeta')).status).toBe(403);
    expect((await pedir(handler, 'get_pin', { delivery_id: ENTREGA }, 'admin')).status).toBe(403);
    expect(await pedir(handler, 'get_pin', { delivery_id: ENTREGA }, 'remetente')).toEqual({
      status: 200,
      json: { pin: '4821', expires_at: FUTURO, bloqueado: false },
    });
    cenario({ status: 'DELIVERED' });
    expect((await pedir(handler, 'get_pin', { delivery_id: ENTREGA }, 'remetente')).status).toBe(409);
  });

  test('regenerate_pin: PIN novo de 4 dígitos, 72 h, tentativas a zero, registo sem o PIN', async () => {
    const s = cenario({ pin_failed_attempts: 5, confirmation_pin_expires_at: PASSADO });
    expect((await pedir(handler, 'regenerate_pin', { delivery_id: ENTREGA }, 'estafeta')).status).toBe(403);
    const r = await pedir(handler, 'regenerate_pin', { delivery_id: ENTREGA }, 'remetente');
    expect(r.status).toBe(200);
    expect(r.json.pin).toMatch(/^[1-9]\d{3}$/);
    const horas = (Date.parse(r.json.expires_at) - Date.now()) / 3600000;
    expect(horas).toBeGreaterThan(71.9);
    expect(horas).toBeLessThanOrEqual(72);
    expect(entrega(s)).toMatchObject({ confirmation_pin: r.json.pin, pin_failed_attempts: 0 });
    expect(JSON.stringify(linhas(s, 'audit_logs'))).not.toContain(r.json.pin);
    expect((await fechar({ pin: r.json.pin })).status).toBe(200);
  });
});

describe('deliveries v19: ver as provas (links de 10 minutos)', () => {
  test('quem criou, o estafeta e os administradores; ficheiros privados com link assinado', async () => {
    const s = cenario();
    await fechar();
    expect((await pedir(handler, 'proof_files', { delivery_id: ENTREGA }, 'outro')).status).toBe(403);
    const r = await pedir(handler, 'proof_files', { delivery_id: ENTREGA }, 'remetente');
    expect(r.status).toBe(200);
    expect(r.json.proofs).toEqual([
      expect.objectContaining({
        proof_type: 'POD',
        photo_url: `https://assinado/${BUCKET_PROVAS}/${ESTAFETA}/pod-1790000000000.jpg?s=600`,
        signature_url: `https://assinado/${BUCKET_PROVAS}/${ESTAFETA}/assinatura-1790000000000.png?s=600`,
      }),
    ]);
    expect(s.linksPedidos.every((l) => l.segundos === 600)).toBe(true);
    expect((await pedir(handler, 'proof_files', { delivery_id: ENTREGA }, 'admin')).status).toBe(200);
    expect((await pedir(handler, 'proof_files', { delivery_id: ENTREGA }, 'estafeta')).status).toBe(200);
  });
});

describe('deliveries v19: assinatura criptográfica ligada à prova', () => {
  const chavePrivada = p256.utils.randomSecretKey();
  const jwk = chavePublicaParaJwk(p256.getPublicKey(chavePrivada, false));
  const assinarProva = criarAssinarProva({
    assinar: async (m) => ({ deviceId: 'aparelho-1', assinatura: p256.sign(m, chavePrivada, { prehash: true, lowS: true, format: 'compact' }) }),
  });
  const dados: DadosProva = {
    delivery_id: ENTREGA,
    lat: -12.77,
    lng: 15.73,
    plus_code: '6GXV+2C',
    foto_sha256: sha256Hex(FOTO_BYTES),
    assinatura_manuscrita_sha256: sha256Hex(ASSINATURA_BYTES),
  };
  const local = { latitude: -12.77, longitude: 15.73 };

  let s: SupabaseFalso;
  beforeEach(() => {
    s = cenario();
    s.tabelas().signing_keys = [{ user_id: ESTAFETA, device_id: 'aparelho-1', public_key_jwk: jwk }];
  });

  test('a prova assinada pela app (com o SHA-256 da foto e da assinatura) confere no servidor', async () => {
    const r = await fechar({}, { ...local, ...paraCamposProva(await assinarProva(dados)) });
    expect(r.json).toEqual({ ok: true, status: 'DELIVERED', crypto_verified: true });
    expect(linhas(s, 'delivery_proofs')[0]).toMatchObject({ crypto_verified: true, crypto_failure_reason: null });
  });

  test('foto trocada depois de assinar: não confere, mas a entrega fecha e o motivo fica registado', async () => {
    const outraFoto = paraCamposProva(await assinarProva({ ...dados, foto_sha256: sha256Hex(new Uint8Array([0])) }));
    const r = await fechar({}, { ...local, ...outraFoto });
    expect(r.json).toEqual({ ok: true, status: 'DELIVERED', crypto_verified: false });
    expect(linhas(s, 'delivery_proofs')[0]).toMatchObject({ crypto_verified: false, crypto_failure_reason: 'foto diferente da assinada' });
    expect(linhas(s, 'audit_logs')[0].after).toMatchObject({ crypto_verified: false, crypto_failure_reason: 'foto diferente da assinada' });
  });

  test('local diferente do assinado, outra entrega, texto alterado ou aparelho sem chave: não confere', async () => {
    const campos = paraCamposProva(await assinarProva(dados));
    const casos: [Record<string, unknown>, string][] = [
      [{ ...campos, latitude: -12.78, longitude: 15.73 }, 'local diferente do assinado'],
      [{ ...local, ...paraCamposProva(await assinarProva({ ...dados, delivery_id: 'outra' })) }, 'assinada para outra entrega'],
      [{ ...local, ...campos, crypto_payload: campos.crypto_payload.replace('-12.77', '-12.78') }, 'assinatura nao confere com a chave do aparelho'],
      [{ ...local, ...campos, crypto_device_id: 'aparelho-2' }, 'aparelho sem chave registada'],
    ];
    for (const [proof, motivo] of casos) {
      s = cenario();
      s.tabelas().signing_keys = [{ user_id: ESTAFETA, device_id: 'aparelho-1', public_key_jwk: jwk }];
      const r = await fechar({}, proof);
      expect(r.json.crypto_verified).toBe(false);
      expect(linhas(s, 'delivery_proofs')[0].crypto_failure_reason).toBe(motivo);
    }
  });

  test('a mensagem do site (versão 1: entrega, local e data) também confere', async () => {
    const payload = JSON.stringify({ delivery_id: ENTREGA, lat: -12.77, lng: 15.73, timestamp: new Date().toISOString() });
    const assinatura = p256.sign(new TextEncoder().encode(payload), chavePrivada, { prehash: true, format: 'compact' });
    const proof = {
      ...local,
      photo_url: FOTO_SITE,
      signature_url: ASSINATURA_SITE,
      crypto_payload: payload,
      crypto_signature: Buffer.from(assinatura).toString('base64'),
      crypto_algorithm: 'ECDSA-SHA256',
      crypto_device_id: 'aparelho-1',
    };
    expect((await fechar({}, proof)).json.crypto_verified).toBe(true);
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

describe('deliveries v19: regras puras', () => {
  test('gerarPin: sempre 4 dígitos entre 1000 e 9999, e rejeita os valores que dariam viés', () => {
    let chamadas = 0;
    const seq = [[0xff, 0xff], [0, 0]]; // 65535 fica acima do limite sem viés → volta a sortear
    expect(gerarPin(() => new Uint8Array(seq[chamadas++]))).toBe('1000');
    expect(chamadas).toBe(2);
    expect(gerarPin(() => new Uint8Array([0x23, 0x27]))).toBe('9999'); // 8999 → 9999
    for (let i = 0; i < 200; i++) expect(gerarPin((n) => crypto.getRandomValues(new Uint8Array(n)))).toMatch(/^[1-9]\d{3}$/);
  });

  test('ficheiroDaProva: caminho da app, URL do Storage e URL público do site; recusa o resto', () => {
    const u = URL_SUPABASE_FALSO;
    expect(ficheiroDaProva(FOTO, u)).toEqual({ bucket: BUCKET_PROVAS, nome: `${ESTAFETA}/pod-1790000000000.jpg` });
    expect(ficheiroDaProva(`${u}/storage/v1/object/public/${FOTO}`, u)).toEqual({ bucket: BUCKET_PROVAS, nome: `${ESTAFETA}/pod-1790000000000.jpg` });
    expect(ficheiroDaProva(`${u}/storage/v1/object/${FOTO}`, u)).toEqual({ bucket: BUCKET_PROVAS, nome: `${ESTAFETA}/pod-1790000000000.jpg` });
    expect(ficheiroDaProva(FOTO_SITE, u)).toEqual({ bucket: BUCKET_LEGADO, nome: 'pod-1790000000000.jpg' });
    for (const mau of [
      'https://outro.com/storage/v1/object/public/field-photos/pod-1.jpg',
      `${BUCKET_PROVAS}/pod-1790000000000.jpg`,
      `${BUCKET_PROVAS}/${ESTAFETA}/../x/pod-1.jpg`,
      `${BUCKET_LEGADO}/pasta/pod-1790000000000.jpg`,
      'kyc-artifacts/x/selfie-1.jpg',
      'offline:abc',
      42,
    ]) {
      expect(ficheiroDaProva(mau, u)).toBeNull();
    }
  });

  test('validarFicheirosProva: a mesma imagem não serve de foto e de assinatura', () => {
    expect(validarFicheirosProva('DELIVERED', { photo_url: FOTO, signature_url: FOTO }, ESTAFETA, URL_SUPABASE_FALSO)).toEqual({
      ok: false,
      status: 422,
      erro: 'a foto e a assinatura tem de ser ficheiros diferentes',
    });
    expect(validarFicheirosProva('FAILED', null, ESTAFETA, URL_SUPABASE_FALSO)).toEqual({ ok: true, foto: null, assinatura: null });
  });

  test('diferencaNaMensagem: data no futuro, mensagem ilegível e versão desconhecida', () => {
    const agora = new Date('2026-09-24T12:00:00Z');
    const c = { deliveryId: ENTREGA, latitude: null, longitude: null, fotoSha256: null, assinaturaSha256: null, agora };
    const msg = (m: object) => JSON.stringify({ delivery_id: ENTREGA, timestamp: '2026-09-24T11:00:00Z', ...m });
    expect(diferencaNaMensagem(msg({}), c)).toBeNull();
    expect(diferencaNaMensagem(msg({ timestamp: '2026-09-24T12:30:00Z' }), c)).toBe('data da assinatura no futuro');
    expect(diferencaNaMensagem(msg({ timestamp: '2026-09-24T12:05:00Z' }), c)).toBeNull(); // folga de 10 min
    expect(diferencaNaMensagem('{nao e json', c)).toBe('mensagem assinada ilegivel');
    expect(diferencaNaMensagem(msg({ versao: 3 }), c)).toBe('versao da mensagem desconhecida');
    expect(diferencaNaMensagem(msg({ lat: 1, lng: 2 }), c)).toBe('local assinado mas nao enviado na prova');
    expect(diferencaNaMensagem(msg({ versao: 2, foto_sha256: null, assinatura_manuscrita_sha256: null }), c)).toBeNull();
  });

  test('respostaPin: mensagens e códigos para a app e o site', () => {
    expect(respostaPin({ resultado: 'OK' })).toBeNull();
    expect(respostaPin({ resultado: 'WRONG', restantes: 3 })).toEqual({ status: 400, erro: 'PIN de confirmacao incorreto (restam 3 tentativas)' });
    expect(respostaPin({ resultado: 'LOCKED' })?.status).toBe(423);
    expect(respostaPin({ resultado: 'EXPIRED' })?.erro).toMatch(/^PIN_EXPIRED/);
    expect(respostaPin(null)?.status).toBe(500);
  });
});

describe('segurança das entregas na base de dados (migração)', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260924060000_seguranca_entregas.sql'), 'utf8');

  test('o PIN (e o contador de tentativas) não estão nas colunas que a app e o site podem ler', () => {
    expect(sql).toMatch(/revoke all on public\.deliveries from anon, authenticated;/);
    const colunas = sql.match(/grant select \(([\s\S]*?)\) on public\.deliveries to authenticated;/)![1];
    expect(colunas).not.toMatch(/confirmation_pin\b/);
    expect(colunas).not.toMatch(/pin_failed_attempts/);
    expect(colunas).toMatch(/confirmation_pin_expires_at/);
    // As colunas que o site pede (minhas entregas) continuam legíveis.
    for (const c of ['tracking_code', 'status', 'recipient_name', 'recipient_phone', 'instructions', 'updated_at', 'origin_postal_code', 'origin_plus_code', 'is_urgent']) {
      expect(colunas).toMatch(new RegExp(`\\b${c}\\b`));
    }
  });

  test('ninguém cria nem muda entregas, provas ou histórico diretamente', () => {
    expect(sql).toMatch(/drop policy if exists "Criar entrega própria" on public\.deliveries;/);
    expect(sql).toMatch(/drop policy if exists "Editar entrega própria \(exceto estado\)" on public\.deliveries;/);
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.delivery_proofs from anon, authenticated;/);
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.delivery_status_history from anon, authenticated;/);
  });

  test('PIN com sorteio forte e funções SQL só para o servidor', () => {
    expect(sql).toMatch(/extensions\.gen_random_bytes/);
    expect(sql).toMatch(/alter column confirmation_pin set default public\.gerar_pin_entrega\(\)/);
    for (const f of ['gerar_pin_entrega()', 'verificar_pin_entrega(uuid, text)', 'ficheiros_da_prova(text[], text[], uuid)']) {
      expect(sql).toContain(`revoke execute on function public.${f} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${f} to service_role;`);
    }
    expect(sql).toMatch(/for update;/);
    expect(sql).toMatch(/maximo constant integer := 5;/);
  });

  test('bucket delivery-proofs privado, 10 MB, JPEG e PNG, e cada pessoa só envia para a sua pasta', () => {
    expect(sql).toMatch(/values \('delivery-proofs', 'delivery-proofs', false, 10485760, array\['image\/jpeg', 'image\/png'\]\)/);
    expect(sql).toMatch(/bucket_id = 'delivery-proofs'\s+and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
    expect(sql).not.toMatch(/position\('\/' in name\)/);
  });
});
