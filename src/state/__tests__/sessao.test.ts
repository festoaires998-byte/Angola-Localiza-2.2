import { describe, expect, test } from '@jest/globals';

import type { PerfilLocal } from '@/database/repositories/perfilLocal';

import { criarSessao, type DependenciasSessao, type NivelSessao, type UtilizadorSessao } from '../criarSessao';

const ANA: UtilizadorSessao = { id: 'u-ana', email: 'ana@exemplo.ao' };
const RUI: UtilizadorSessao = { id: 'u-rui', email: null };

function perfil(userId: string, cargos: string[], kyc: string | null): PerfilLocal {
  return { user_id: userId, email: null, cargos, estado_kyc: kyc, confirmado_em: '2026-09-23T10:00:00.000Z' };
}

/** Espera que todas as promessas pendentes corram. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

function montar(opcoes: {
  nivel?: NivelSessao;
  perfil?: (u: UtilizadorSessao | null) => Promise<{ utilizador: UtilizadorSessao; perfil: PerfilLocal | null; confirmadoAgora: boolean } | null>;
  perfilGuardado?: DependenciasSessao['perfilGuardado'];
  esperaPerfilMs?: number;
}) {
  let emitir: (u: UtilizadorSessao | null) => void = () => undefined;
  let atual: UtilizadorSessao | null = null;
  const deps: DependenciasSessao = {
    ouvirSessao(o) {
      emitir = (u) => {
        atual = u;
        o(u);
      };
      return () => undefined;
    },
    nivelGarantia: async () => opcoes.nivel ?? { atual: 'aal1', proximo: 'aal1' },
    carregarPerfil: () => (opcoes.perfil ? opcoes.perfil(atual) : Promise.resolve(null)),
    perfilGuardado: opcoes.perfilGuardado,
    esperaPerfilMs: opcoes.esperaPerfilMs,
  };
  const s = criarSessao(deps);
  s.iniciar();
  return { s, emitir: (u: UtilizadorSessao | null) => emitir(u) };
}

describe('estado da sessão', () => {
  test('começa fechado e sem utilizador', () => {
    const { s } = montar({});
    expect(s.loja.obter()).toMatchObject({ carregado: false, utilizador: null });
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
  });

  test('cidadão confirmado: abre os separadores do cidadão', async () => {
    const { s, emitir } = montar({
      perfil: async (u) => ({ utilizador: u!, perfil: perfil(u!.id, [], null), confirmadoAgora: true }),
    });
    const vezes: number[] = [];
    s.loja.subscrever(() => vezes.push(1));
    emitir(ANA);
    await esperar();
    expect(s.loja.obter()).toMatchObject({ carregado: true, utilizador: ANA, perfilConfirmadoAgora: true });
    expect(s.loja.obter().acesso.separadores).toContain('entrega');
    expect(vezes.length).toBeGreaterThan(0);
  });

  test('staff em AAL1 com fator: falta MFA (verificar)', async () => {
    const { s, emitir } = montar({
      nivel: { atual: 'aal1', proximo: 'aal2' },
      perfil: async (u) => ({ utilizador: u!, perfil: perfil(u!.id, ['estafeta'], 'ID_VERIFIED'), confirmadoAgora: true }),
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter().acesso).toMatchObject({ faltaMfa: true, passoMfa: 'verificar', separadores: ['inicio', 'mapa', 'definicoes'] });
  });

  test('staff em AAL1 sem fator: falta MFA (inscrever)', async () => {
    const { s, emitir } = montar({
      nivel: { atual: 'aal1', proximo: 'aal1' },
      perfil: async (u) => ({ utilizador: u!, perfil: perfil(u!.id, ['estafeta'], 'ID_VERIFIED'), confirmadoAgora: true }),
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter().acesso.passoMfa).toBe('inscrever');
  });

  test('sem rede e sem perfil guardado: só mapa e definicoes', async () => {
    const { s, emitir } = montar({
      perfil: async (u) => ({ utilizador: u!, perfil: null, confirmadoAgora: false }),
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter()).toMatchObject({ perfilConfirmadoAgora: false });
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
  });

  test('trocar de utilizador não deixa passar o perfil do anterior', async () => {
    let soltarRui: () => void = () => undefined;
    const { s, emitir } = montar({
      nivel: { atual: 'aal2', proximo: 'aal2' },
      perfil: (u) => {
        if (u?.id === RUI.id) {
          return new Promise((r) => {
            soltarRui = () => r({ utilizador: RUI, perfil: null, confirmadoAgora: false });
          });
        }
        return Promise.resolve({ utilizador: u!, perfil: perfil(u!.id, ['super_admin'], null), confirmadoAgora: true });
      },
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter().acesso.separadores).toContain('admin');

    emitir(RUI);
    await esperar();
    // Enquanto o perfil do Rui não chega, não herda o super_admin da Ana.
    expect(s.loja.obter().utilizador).toEqual(RUI);
    expect(s.loja.obter().perfil).toBeNull();
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
    soltarRui();
    await esperar();
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
  });

  test('um resultado atrasado de antes de sair é ignorado', async () => {
    let soltar: () => void = () => undefined;
    const { s, emitir } = montar({
      nivel: { atual: 'aal2', proximo: 'aal2' },
      perfil: (u) =>
        new Promise((r) => {
          soltar = () => r({ utilizador: u!, perfil: perfil(u!.id, ['super_admin'], null), confirmadoAgora: true });
        }),
    });
    emitir(ANA);
    await esperar();
    emitir(null);
    await esperar();
    soltar();
    await esperar();
    expect(s.loja.obter()).toMatchObject({ utilizador: null, perfil: null });
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
  });

  test('sem rede: abre logo com o último perfil guardado neste telemóvel', async () => {
    const { s, emitir } = montar({
      nivel: { atual: 'aal2', proximo: 'aal2' },
      // O servidor nunca responde (sem rede).
      perfil: () => new Promise(() => undefined),
      perfilGuardado: async (id) => perfil(id, ['tecnico_campo'], 'ID_VERIFIED'),
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter()).toMatchObject({ carregado: true, perfilLido: true, perfilConfirmadoAgora: false });
    expect(s.loja.obter().acesso.separadores).toContain('campo');
  });

  test('sem perfil guardado: espera pelo servidor, mas não para sempre', async () => {
    const { s, emitir } = montar({
      perfil: () => new Promise(() => undefined),
      perfilGuardado: async () => null,
      esperaPerfilMs: 20,
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter()).toMatchObject({ carregado: true, perfilLido: false });
    await new Promise((r) => setTimeout(r, 40));
    expect(s.loja.obter().perfilLido).toBe(true);
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
  });

  test('o perfil guardado de outro utilizador nunca é usado', async () => {
    const { s, emitir } = montar({
      nivel: { atual: 'aal2', proximo: 'aal2' },
      perfil: () => new Promise(() => undefined),
      perfilGuardado: async () => perfil(RUI.id, ['super_admin'], null),
      esperaPerfilMs: 10_000,
    });
    emitir(ANA);
    await esperar();
    expect(s.loja.obter().perfil).toBeNull();
    expect(s.loja.obter().acesso.separadores).toEqual(['inicio', 'mapa', 'definicoes']);
    s.parar();
  });
});
