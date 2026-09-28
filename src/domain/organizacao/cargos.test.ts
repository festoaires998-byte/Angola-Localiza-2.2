import { describe, expect, test } from '@jest/globals';

import {
  CARGOS,
  decidirAcesso,
  exigeMfa,
  normalizarCargos,
  SEPARADORES,
  separadoresPermitidos,
  type Cargo,
  type EntradaAcesso,
  type Separador,
} from './cargos';

const MINIMOS: Separador[] = ['mapa', 'marketplace', 'definicoes'];
const OK = 'ID_VERIFIED';

describe('separadoresPermitidos', () => {
  test.each<[string, Cargo[], string | null, Separador[]]>([
    // super_admin → todos, com ou sem KYC
    ['super_admin verificado', ['super_admin'], OK, [...SEPARADORES]],
    ['super_admin sem KYC', ['super_admin'], null, [...SEPARADORES]],
    ['super_admin com outro cargo', ['super_admin', 'auditor'], 'PENDING_ID', [...SEPARADORES]],
    // cidadão (sem cargos) → nunca bloqueado por KYC
    ['cidadão sem KYC', [], null, ['mapa', 'guardados', 'entrega', 'minhas-entregas', 'marketplace', 'definicoes']],
    ['cidadão com KYC pendente', [], 'PENDING_ID', ['mapa', 'guardados', 'entrega', 'minhas-entregas', 'marketplace', 'definicoes']],
    ['cidadão verificado', [], OK, ['mapa', 'guardados', 'entrega', 'minhas-entregas', 'marketplace', 'definicoes']],
    // cada cargo, com KYC verificado
    ['tecnico_campo', ['tecnico_campo'], OK, ['mapa', 'guardados', 'campo', 'definicoes']],
    ['estafeta', ['estafeta'], OK, ['mapa', 'minhas-entregas', 'definicoes']],
    ['operador_postal', ['operador_postal'], OK, ['mapa', 'minhas-entregas', 'definicoes']],
    ['supervisor', ['supervisor'], OK, ['mapa', 'guardados', 'validar', 'definicoes']],
    ['admin_municipal', ['admin_municipal'], OK, ['mapa', 'validar', 'admin', 'definicoes']],
    ['admin_provincial', ['admin_provincial'], OK, ['mapa', 'validar', 'admin', 'definicoes']],
    ['admin_nacional', ['admin_nacional'], OK, ['mapa', 'validar', 'admin', 'definicoes']],
    ['auditor', ['auditor'], OK, ['mapa', 'admin', 'definicoes']],
    ['empresa', ['empresa'], OK, MINIMOS],
    // vários cargos juntam-se
    ['tecnico_campo + estafeta', ['tecnico_campo', 'estafeta'], OK, ['mapa', 'guardados', 'minhas-entregas', 'campo', 'definicoes']],
    ['supervisor + auditor', ['supervisor', 'auditor'], OK, ['mapa', 'guardados', 'validar', 'admin', 'definicoes']],
    // staff sem KYC verificado → só mapa e definicoes
    ['tecnico_campo sem KYC', ['tecnico_campo'], null, MINIMOS],
    ['estafeta com KYC pendente', ['estafeta'], 'PENDING_ID', MINIMOS],
    ['admin_nacional com KYC rejeitado', ['admin_nacional'], 'REJECTED', MINIMOS],
    ['auditor com "id_verified" em minúsculas', ['auditor'], 'id_verified', MINIMOS],
  ])('%s', (_nome, cargos, kyc, esperado) => {
    expect(separadoresPermitidos(cargos, kyc)).toEqual(esperado);
  });

  test('mapa e definicoes aparecem sempre', () => {
    for (const cargo of CARGOS) {
      for (const kyc of [OK, null, 'PENDING_ID']) {
        const r = separadoresPermitidos([cargo], kyc);
        expect(r).toContain('mapa');
        expect(r).toContain('definicoes');
      }
    }
  });
});

describe('exigeMfa', () => {
  test.each<[Cargo[], boolean]>([
    [[], false],
    ...CARGOS.map((c): [Cargo[], boolean] => [[c], true]),
    [['estafeta', 'tecnico_campo'], true],
  ])('%j → %s', (cargos, esperado) => {
    expect(exigeMfa(cargos)).toBe(esperado);
  });
});

describe('normalizarCargos', () => {
  test('ignora cargos desconhecidos e repetidos', () => {
    expect(normalizarCargos(['estafeta', 'rei', 'estafeta', 3, null, 'auditor'])).toEqual([
      'auditor',
      'estafeta',
    ]);
  });
});

describe('decidirAcesso (MFA e falhar fechado)', () => {
  const cidadao = { cargos: [] as Cargo[], estadoKyc: null };
  const tecnico = { cargos: ['tecnico_campo'] as Cargo[], estadoKyc: OK };
  const superAdmin = { cargos: ['super_admin'] as Cargo[], estadoKyc: null };

  test.each<[string, EntradaAcesso, Separador[], boolean, string | null]>([
    // sem nenhum perfil confirmado → mínimo, mesmo que a sessão seja AAL2
    ['sem perfil, AAL1', { perfil: null, nivel: 'aal1' }, MINIMOS, false, 'sem_perfil'],
    ['sem perfil, AAL2', { perfil: null, nivel: 'aal2' }, MINIMOS, false, 'sem_perfil'],
    ['sem perfil, nível desconhecido', { perfil: null, nivel: null }, MINIMOS, false, 'sem_perfil'],
    // cidadão não precisa de MFA
    ['cidadão AAL1', { perfil: cidadao, nivel: 'aal1' }, ['mapa', 'guardados', 'entrega', 'minhas-entregas', 'marketplace', 'definicoes'], false, null],
    ['cidadão, nível desconhecido', { perfil: cidadao, nivel: null }, ['mapa', 'guardados', 'entrega', 'minhas-entregas', 'marketplace', 'definicoes'], false, null],
    // staff sem AAL2 → mínimo até verificar o código
    ['técnico AAL1', { perfil: tecnico, nivel: 'aal1' }, MINIMOS, true, 'falta_mfa'],
    ['técnico, nível desconhecido', { perfil: tecnico, nivel: null }, MINIMOS, true, 'falta_mfa'],
    ['super_admin AAL1', { perfil: superAdmin, nivel: 'aal1' }, MINIMOS, true, 'falta_mfa'],
    // staff com AAL2 → regras normais
    ['técnico AAL2', { perfil: tecnico, nivel: 'aal2' }, ['mapa', 'guardados', 'campo', 'definicoes'], false, null],
    ['super_admin AAL2', { perfil: superAdmin, nivel: 'aal2' }, [...SEPARADORES], false, null],
    ['técnico AAL2 sem KYC', { perfil: { cargos: ['tecnico_campo'], estadoKyc: 'PENDING_ID' }, nivel: 'aal2' }, MINIMOS, false, 'kyc'],
  ])('%s', (_nome, entrada, separadores, faltaMfa, restricao) => {
    const r = decidirAcesso(entrada);
    expect(r.separadores).toEqual(separadores);
    expect(r.faltaMfa).toBe(faltaMfa);
    expect(r.restricao).toBe(restricao);
  });

  test.each<[boolean | null | undefined, 'verificar' | 'inscrever']>([
    [true, 'verificar'],
    [false, 'inscrever'],
    [null, 'verificar'],
    [undefined, 'verificar'],
  ])('temFatorMfa=%s → passo "%s"', (temFatorMfa, passo) => {
    expect(decidirAcesso({ perfil: tecnico, nivel: 'aal1', temFatorMfa }).passoMfa).toBe(passo);
  });

  test.each<[string, string[]]>([
    ['só um cargo desconhecido', ['rei']],
    ['vários cargos desconhecidos', ['rei', 'rainha']],
  ])('%s → só mapa e definicoes (nunca passa a cidadão)', (_nome, cargos) => {
    for (const kyc of [OK, null]) {
      for (const nivel of ['aal1', 'aal2', null] as const) {
        const r = decidirAcesso({ perfil: { cargos, estadoKyc: kyc }, nivel });
        expect(r.separadores).toEqual(MINIMOS);
        expect(r.restricao).toBe('cargo_desconhecido');
        expect(r.separadores).not.toContain('entrega');
      }
    }
  });

  test.each<[string, string[], string | null, 'aal1' | 'aal2', Separador[], boolean, string | null]>([
    ['estafeta + desconhecido, AAL2', ['estafeta', 'rei'], OK, 'aal2', ['mapa', 'minhas-entregas', 'definicoes'], false, null],
    ['super_admin + desconhecido, AAL2', ['super_admin', 'rei'], null, 'aal2', [...SEPARADORES], false, null],
    ['supervisor + auditor + desconhecido, AAL2', ['rei', 'supervisor', 'auditor'], OK, 'aal2', ['mapa', 'guardados', 'validar', 'admin', 'definicoes'], false, null],
    // Os conhecidos continuam a exigir MFA e KYC.
    ['estafeta + desconhecido, AAL1', ['estafeta', 'rei'], OK, 'aal1', MINIMOS, true, 'falta_mfa'],
    ['estafeta + desconhecido, sem KYC', ['estafeta', 'rei'], 'PENDING_ID', 'aal2', MINIMOS, false, 'kyc'],
  ])('%s → desconhecidos ignorados, conhecidos aplicam-se', (_nome, cargos, kyc, nivel, separadores, faltaMfa, restricao) => {
    const r = decidirAcesso({ perfil: { cargos, estadoKyc: kyc }, nivel });
    expect(r.separadores).toEqual(separadores);
    expect(r.faltaMfa).toBe(faltaMfa);
    expect(r.restricao).toBe(restricao);
  });

  test('nunca abre mais do que separadoresPermitidos do último perfil confirmado', () => {
    for (const cargo of CARGOS) {
      for (const kyc of [OK, null]) {
        for (const nivel of ['aal1', 'aal2', null] as const) {
          const perfil = { cargos: [cargo], estadoKyc: kyc };
          const decidido = decidirAcesso({ perfil, nivel }).separadores;
          const maximo = separadoresPermitidos([cargo], kyc);
          expect(decidido.every((s) => maximo.includes(s))).toBe(true);
        }
      }
    }
  });
});
