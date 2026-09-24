import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { BUCKET, contactoDoCidadao, eRevisaoPropria, estadoPublico, validarAbertura, validarPedido, validarRevisao } from '../../supabase/functions/citizen-verify/regras';
import { lerEstadoVerificacao } from '@/api/verificacaoNucleo';
import { estadoDoServidor, nomeNoBucket } from '@/domain/identidade/verificacaoSimples';

const raiz = join(__dirname, '..', '..');
const ler = (f: string) => readFileSync(join(raiz, f), 'utf8');
const UID = '3f1c2b7a-9d4e-4b8a-a1c2-0e9f8d7c6b5a';

describe('citizen-verify v3: regras do pedido', () => {
  test('aceita os nomes da app e do site (ficheiros na raiz do bucket kyc-artifacts)', () => {
    expect(BUCKET).toBe('kyc-artifacts');
    const app = validarPedido({
      id_photo_front_url: nomeNoBucket(UID, 'frente', 1),
      id_photo_back_url: nomeNoBucket(UID, 'verso', 1),
      selfie_url: nomeNoBucket(UID, 'selfie', 1),
    });
    expect(app.ok).toBe(true);
    const site = validarPedido({
      id_photo_front_url: 'bi-frente-1789862674760.jpg',
      id_photo_back_url: ' cidadao-verso-1790024310991.jpg ',
      selfie_url: 'cidadao-selfie-1790024287722.jpg',
    });
    expect(site).toEqual({
      ok: true,
      pedido: {
        id_photo_front_url: 'bi-frente-1789862674760.jpg',
        id_photo_back_url: 'cidadao-verso-1790024310991.jpg',
        selfie_url: 'cidadao-selfie-1790024287722.jpg',
      },
      nomes: ['bi-frente-1789862674760.jpg', 'cidadao-verso-1790024310991.jpg', 'cidadao-selfie-1790024287722.jpg'],
    });
  });

  test('recusa pedidos incompletos, caminhos para outras pastas/URLs e a mesma foto repetida', () => {
    expect(validarPedido({ id_photo_front_url: 'a-1.jpg', id_photo_back_url: 'b-1.jpg' })).toMatchObject({ ok: false });
    expect(validarPedido(null)).toMatchObject({ ok: false });
    for (const mau of ['../outra/f.jpg', 'pasta/f.jpg', 'https://x.y/f.jpg', 'a..b.jpg', 'x.j']) {
      expect(validarPedido({ id_photo_front_url: mau, id_photo_back_url: 'b-12.jpg', selfie_url: 'c-12.jpg' })).toEqual({
        ok: false,
        erro: 'nome de ficheiro invalido',
      });
    }
    expect(validarPedido({ id_photo_front_url: 'a-12.jpg', id_photo_back_url: 'a-12.jpg', selfie_url: 'c-12.jpg' })).toMatchObject({
      ok: false,
    });
  });

  test('estado para o cidadão: só mostra o motivo quando foi recusada', () => {
    expect(estadoPublico(null)).toEqual({ citizen_id_verified: false, citizen_id_status: null, rejection_reason: null });
    expect(estadoPublico({ citizen_id_verified: false, citizen_id_status: 'PENDING_REVIEW', citizen_id_rejection_reason: 'x' })).toEqual({
      citizen_id_verified: false,
      citizen_id_status: 'PENDING_REVIEW',
      rejection_reason: null,
    });
    expect(estadoPublico({ citizen_id_verified: false, citizen_id_status: 'REJECTED', citizen_id_rejection_reason: 'Desfocada' })).toMatchObject({
      rejection_reason: 'Desfocada',
    });
    // Verificados antes da coluna nova continuam verificados.
    expect(estadoPublico({ citizen_id_verified: true, citizen_id_status: null })).toMatchObject({ citizen_id_status: 'VERIFIED' });
  });

  test('revisão do administrador: user_id válido, approve/reject, e recusar exige motivo', () => {
    expect(validarRevisao({ user_id: UID, decision: 'approve' })).toEqual({ ok: true, userId: UID, aprovar: true, motivo: null });
    expect(validarRevisao({ user_id: UID, decision: 'reject', reason: ' BI ilegível ' })).toEqual({
      ok: true,
      userId: UID,
      aprovar: false,
      motivo: 'BI ilegível',
    });
    expect(validarRevisao({ user_id: UID, decision: 'reject' })).toMatchObject({ ok: false });
    expect(validarRevisao({ user_id: 'x', decision: 'approve' })).toMatchObject({ ok: false });
    expect(validarRevisao({ user_id: UID, decision: 'talvez' })).toMatchObject({ ok: false });
  });
});

describe('citizen-verify v4: quem é o cidadão (para o administrador)', () => {
  test('email e nome da conta, telefone de user_identity (ou da conta)', () => {
    expect(
      contactoDoCidadao({ email: 'ana@exemplo.ao', phone: '', user_metadata: { full_name: ' Ana Silva ' } }, '+244923000000'),
    ).toEqual({ email: 'ana@exemplo.ao', name: 'Ana Silva', phone: '+244923000000' });
    expect(contactoDoCidadao({ email: 'b@x.ao', phone: '+244911', user_metadata: { name: 'Bento' } }, null)).toEqual({
      email: 'b@x.ao',
      name: 'Bento',
      phone: '+244911',
    });
    expect(contactoDoCidadao({ email: null, user_metadata: { nome: 'Carla' } }, undefined)).toMatchObject({ name: 'Carla' });
    // Conta que já não existe, ou sem dados.
    expect(contactoDoCidadao(null, null)).toEqual({ email: null, name: null, phone: null });
    expect(contactoDoCidadao({ email: '  ', user_metadata: { full_name: 42 } }, '  ')).toEqual({ email: null, name: null, phone: null });
  });

  test('list_pending junta o contacto em paralelo, sem links de fotos e sem o próprio pedido do administrador', () => {
    const fonte = ler('supabase/functions/citizen-verify/index.ts');
    const lista = fonte.slice(fonte.indexOf('if (action === "list_pending") {'), fonte.indexOf('if (action === "view") {'));
    expect(lista).toContain('await Promise.all((data ?? []).map(async (p) => {');
    expect(lista).toContain('supabase.auth.admin.getUserById(p.user_id)');
    expect(lista).toContain('...contactoDoCidadao(conta?.user ?? null, p.phone)');
    expect(lista).toContain('.neq("user_id", callerId)');
    expect(lista).not.toMatch(/createSignedUrl|for \(const/);
    expect(fonte.indexOf('rpc("is_admin"')).toBeLessThan(fonte.indexOf('getUserById'));
  });
});

describe('o nome da conta chega ao painel Admin', () => {
  test('a app grava o nome em user_metadata.full_name, o campo que a citizen-verify lê', () => {
    const auth = ler('src/api/auth.ts');
    // Criar conta e contas antigas ("O teu nome") usam o mesmo campo.
    expect(auth.match(/data: \{ full_name: normalizarNome\(nome\) \}/g)).toHaveLength(2);
    expect(contactoDoCidadao({ email: 'ana@exemplo.ao', user_metadata: { full_name: 'Ana Maria Silva' } }, null).name).toBe('Ana Maria Silva');
  });
});

describe('citizen-verify v4: segurança da revisão', () => {
  const fonte = ler('supabase/functions/citizen-verify/index.ts');
  const view = fonte.slice(fonte.indexOf('if (action === "view") {'), fonte.indexOf('const r = validarRevisao(body);'));
  const review = fonte.slice(fonte.indexOf('const r = validarRevisao(body);'), fonte.indexOf('return resposta({ error: "acao desconhecida" }, 400);'));

  test('regras: abrir precisa de um uuid; ninguém revê a própria verificação', () => {
    expect(validarAbertura({ user_id: UID })).toEqual({ ok: true, userId: UID });
    expect(validarAbertura({ user_id: 'x' })).toMatchObject({ ok: false });
    expect(validarAbertura(null)).toMatchObject({ ok: false });
    expect(eRevisaoPropria(UID, UID)).toBe(true);
    expect(eRevisaoPropria(UID, UID.toUpperCase())).toBe(true);
    expect(eRevisaoPropria(UID, '00000000-0000-4000-8000-000000000000')).toBe(false);
  });

  test('ponto 1: a própria verificação não se abre nem se decide', () => {
    expect(view).toContain('if (eRevisaoPropria(callerId, a.userId)) return resposta(');
    expect(review).toContain('if (eRevisaoPropria(callerId, r.userId)) return resposta(');
    expect(review.indexOf('eRevisaoPropria')).toBeLessThan(review.indexOf('.update('));
  });

  test('ponto 2: a decisão só grava se ainda estiver PENDING_REVIEW, numa só operação (senão 409)', () => {
    expect(review).toContain('.eq("user_id", r.userId).eq("citizen_id_status", "PENDING_REVIEW").select("user_id")');
    expect(review).toContain('if (!mudadas || mudadas.length === 0) return resposta(');
    expect(review).toMatch(/409\)/);
    // Já não há "ler e depois gravar".
    expect(review).not.toContain('.select("citizen_id_status")');
  });

  test('ponto 5: cada abertura das fotos fica registada ANTES de entregar os links; sem registo, sem fotos', () => {
    const registo = view.indexOf('from("identity_artifact_views").insert({ citizen_user_id: a.userId, viewed_by: callerId })');
    expect(registo).toBeGreaterThan(-1);
    expect(view).toContain('if (erroVista) return resposta(');
    expect(registo).toBeLessThan(view.indexOf('createSignedUrls'));
  });

  test('ponto 8: os links das 3 fotos saem num só pedido ao Storage', () => {
    expect(view).toContain('supabase.storage.from(BUCKET).createSignedUrls(validos, 600)');
    expect(fonte).not.toContain('createSignedUrl(');
  });

  test('a migração deixa registar vistas de cidadãos sem estragar as do staff', () => {
    const sql = ler('supabase/migrations/20260924030000_auditoria_vistas_kyc_cidadao.sql');
    expect(sql).toContain('alter column verification_id drop not null');
    expect(sql).toContain('add column if not exists citizen_user_id uuid references auth.users (id)');
    expect(sql).toContain('check (num_nonnulls(verification_id, citizen_user_id) = 1)');
  });
});

describe('citizen-verify v3: a função', () => {
  const fonte = ler('supabase/functions/citizen-verify/index.ts');

  test('confirma no Storage que as 3 fotos existem e são de quem pede', () => {
    expect(fonte).toContain('supabase.rpc("kyc_artefactos_do_utilizador", { nomes: v.nomes, utilizador: callerId })');
    expect(fonte).toMatch(/if \(encontrados !== 3\)/);
  });

  test('o envio já não aprova: fica PENDING_REVIEW com citizen_id_verified false', () => {
    const submit = fonte.slice(fonte.indexOf('action === "submit"'), fonte.indexOf('action === "list_pending" ||'));
    expect(submit).toContain('citizen_id_verified: false, citizen_id_status: "PENDING_REVIEW"');
    expect(submit).not.toMatch(/citizen_id_verified:\s*true/);
    expect(submit).toContain('resposta({ ok: true, status: "PENDING_REVIEW" })');
  });

  test('listar e rever pedidos só para administradores (is_admin)', () => {
    const admin = fonte.slice(fonte.indexOf('action === "list_pending" ||'));
    expect(admin.indexOf('rpc("is_admin"')).toBeGreaterThan(-1);
    expect(admin.indexOf('rpc("is_admin"')).toBeLessThan(admin.indexOf('.update('));
    expect(admin).toContain('if (!admin) return resposta({ error: "apenas administradores" }, 403);');
  });

  test('a migração cria a função SQL só para o service_role e o estado com os 3 valores', () => {
    const sql = ler('supabase/migrations/20260924020000_verificacao_cidadao_por_rever.sql');
    expect(sql).toMatch(/o\.bucket_id = 'kyc-artifacts'/);
    expect(sql).toMatch(/o\.owner = utilizador or o\.owner_id = utilizador::text/);
    expect(sql).toMatch(/revoke all on function public\.kyc_artefactos_do_utilizador\(text\[\], uuid\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.kyc_artefactos_do_utilizador\(text\[\], uuid\) to service_role;/);
    expect(sql).toContain("('PENDING_REVIEW', 'VERIFIED', 'REJECTED')");
  });
});

describe('app: ler as respostas da citizen-verify', () => {
  test('estados do servidor → estados da app', () => {
    expect(estadoDoServidor(true, null)).toBe('verificado');
    expect(estadoDoServidor(false, 'VERIFIED')).toBe('verificado');
    expect(estadoDoServidor(false, 'PENDING_REVIEW')).toBe('em_revisao');
    expect(estadoDoServidor(false, 'REJECTED')).toBe('rejeitado');
    expect(estadoDoServidor(false, null)).toBe('por_verificar');
    expect(estadoDoServidor(undefined, undefined)).toBe('por_verificar');
  });

  test('status: estado e motivo; erro do servidor vira exceção', () => {
    expect(lerEstadoVerificacao(estadoPublico({ citizen_id_verified: false, citizen_id_status: 'REJECTED', citizen_id_rejection_reason: 'Desfocada' }))).toEqual({
      estado: 'rejeitado',
      motivo: 'Desfocada',
    });
    expect(lerEstadoVerificacao({ citizen_id_verified: false, citizen_id_status: 'PENDING_REVIEW' })).toEqual({ estado: 'em_revisao', motivo: null });
    expect(() => lerEstadoVerificacao({ error: 'sessao invalida' })).toThrow('sessao invalida');
  });
});
