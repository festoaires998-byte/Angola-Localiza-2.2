/**
 * @jest-environment node
 */
import { describe, expect, test } from '@jest/globals';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioPerfilLocal } from '@/database/repositories/perfilLocal';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';

import { carregarPerfilCom, type DependenciasPerfil } from '../perfilNucleo';

const ANA = { id: 'u-ana', email: 'ana@exemplo.ao' };

async function perfis() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  return criarRepositorioPerfilLocal(db, () => new Date('2026-09-23T10:00:00.000Z'));
}

function deps(
  repo: DependenciasPerfil['perfis'],
  cargos: () => Promise<string[]>,
  kyc: () => Promise<string | null>,
  chamadasKyc: { n: number } = { n: 0 },
): DependenciasPerfil {
  return {
    perfis: repo,
    lerCargos: () => cargos(),
    lerEstadoKyc: () => {
      chamadasKyc.n++;
      return kyc();
    },
  };
}

const semRede = () => Promise.reject(new Error('Network request failed'));

describe('carregarPerfil', () => {
  test.each<[string, string[], boolean]>([
    ['cidadão', [], false],
    ['super_admin', ['super_admin'], false],
    ['super_admin com outro cargo', ['super_admin', 'auditor'], false],
    ['estafeta', ['estafeta'], true],
    ['admin_nacional', ['admin_nacional'], true],
  ])('%s: pede KYC = %s', async (_nome, cargos, pedeKyc) => {
    const chamadas = { n: 0 };
    const r = await carregarPerfilCom(
      deps(await perfis(), async () => cargos, async () => 'ID_VERIFIED', chamadas),
      ANA,
    );
    expect(chamadas.n).toBe(pedeKyc ? 1 : 0);
    expect(r.confirmadoAgora).toBe(true);
    expect(r.perfil?.estado_kyc).toBe(pedeKyc ? 'ID_VERIFIED' : null);
  });

  test('corre bem: guarda em perfil_local', async () => {
    const repo = await perfis();
    const r = await carregarPerfilCom(
      deps(repo, async () => ['estafeta', 'estafeta'], async () => 'PENDING_ID'),
      ANA,
    );
    expect(r).toMatchObject({ confirmadoAgora: true, erro: null });
    expect(await repo.obter('u-ana')).toMatchObject({
      email: 'ana@exemplo.ao',
      cargos: ['estafeta'],
      estado_kyc: 'PENDING_ID',
    });
  });

  test('sem rede e sem nada guardado: perfil null (só mapa e definicoes)', async () => {
    const r = await carregarPerfilCom(deps(await perfis(), semRede, semRede), ANA);
    expect(r).toMatchObject({ perfil: null, confirmadoAgora: false });
    expect(r.erro).toMatch(/Network/);
  });

  test('sem rede: devolve o último guardado, marcado como não confirmado agora', async () => {
    const repo = await perfis();
    await carregarPerfilCom(deps(repo, async () => ['tecnico_campo'], async () => 'ID_VERIFIED'), ANA);

    const r = await carregarPerfilCom(deps(repo, semRede, semRede), ANA);
    expect(r.confirmadoAgora).toBe(false);
    expect(r.perfil).toMatchObject({ cargos: ['tecnico_campo'], estado_kyc: 'ID_VERIFIED' });
  });

  test('cargos correm bem mas o KYC falha: não grava metade, usa o último', async () => {
    const repo = await perfis();
    await carregarPerfilCom(deps(repo, async () => ['estafeta'], async () => 'PENDING_ID'), ANA);

    const r = await carregarPerfilCom(deps(repo, async () => ['estafeta', 'admin_nacional'], semRede), ANA);
    expect(r.confirmadoAgora).toBe(false);
    expect(r.perfil).toMatchObject({ cargos: ['estafeta'], estado_kyc: 'PENDING_ID' });
    expect(await repo.obter('u-ana')).toMatchObject({ cargos: ['estafeta'] });
  });

  test('o perfil guardado de outro utilizador nunca é usado', async () => {
    const repo = await perfis();
    await carregarPerfilCom(deps(repo, async () => ['super_admin'], async () => null), {
      id: 'u-outro',
      email: null,
    });
    const r = await carregarPerfilCom(deps(repo, semRede, semRede), ANA);
    expect(r.perfil).toBeNull();
  });
});
