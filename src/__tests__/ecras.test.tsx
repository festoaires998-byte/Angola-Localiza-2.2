import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { PerfilLocal } from '@/database/repositories/perfilLocal';
import { decidirAcesso } from '@/domain/organizacao/cargos';
import type { EstadoSessao, NivelSessao } from '@/state/criarSessao';

// ─── Peças de fora (rede, Supabase, base de dados) substituídas ─────────────

jest.mock('@/state/sessao', () => {
  const { criarLoja } = jest.requireActual<typeof import('@/state/loja')>('@/state/loja');
  const { estadoInicial } = jest.requireActual<typeof import('@/state/criarSessao')>('@/state/criarSessao');
  return {
    sessao: {
      loja: criarLoja(estadoInicial()),
      iniciar: jest.fn(),
      recarregar: jest.fn(async () => undefined),
      parar: jest.fn(),
    },
  };
});

jest.mock('@/sync/gatilhos', () => ({ iniciarSync: jest.fn() }));
jest.mock('@/sync/tarefaSegundoPlano', () => ({ registarTarefaSync: jest.fn(async () => true) }));

const mockContarPendentes = jest.fn(async (_userId: string) => 0);
jest.mock('@/sync/fila', () => ({
  obterRepositoriosSync: async () => ({
    fila: { contarPendentesDoUtilizador: (id: string) => mockContarPendentes(id) },
  }),
}));

const mockMarcarAvisoVisto = jest.fn(async (_id: string) => undefined);
let mockFila: Record<string, unknown> = {};
jest.mock('@/hooks/useFilaSync', () => ({
  useFilaSync: () => ({
    pendentes: 0,
    fotosPendentes: 0,
    operacoesComProblema: [],
    aSincronizar: false,
    ultimaSincronizacao: null,
    ultimoErro: null,
    precisaEntrarDeNovo: false,
    sincronizarAgora: jest.fn(),
    marcarAvisoVisto: mockMarcarAvisoVisto,
    ...mockFila,
  }),
}));

const mockSair = jest.fn(async () => undefined);
jest.mock('@/api/auth', () => ({
  sair: () => mockSair(),
  // Nunca responde: os ecrãs de MFA ficam em "a preparar" (não é isso que se testa aqui).
  listarFatores: () => new Promise(() => undefined),
  removerFatoresPorVerificar: jest.fn(),
  inscreverTotp: jest.fn(),
  desafiarEVerificarTotp: jest.fn(),
  entrar: jest.fn(),
  eErroDeRede: () => false,
  ErroAuth: class ErroAuth extends Error {},
}));

jest.mock('@/services/rede/conectividade', () => ({ estaOnline: async () => true }));
jest.mock('react-native-qrcode-svg', () => () => null);

// ─── Ajudas ────────────────────────────────────────────────────────────────

const { sessao } = jest.requireMock<{ sessao: { loja: { definir(e: EstadoSessao): void } } }>('@/state/sessao');
const { estadoInicial } = jest.requireActual<typeof import('@/state/criarSessao')>('@/state/criarSessao');

function comSessao(cargos: string[], estadoKyc: string | null, nivel: NivelSessao): void {
  const perfil: PerfilLocal = {
    user_id: 'u-1',
    email: 'ana@exemplo.ao',
    cargos,
    estado_kyc: estadoKyc,
    confirmado_em: '2026-09-23T10:00:00.000Z',
  };
  sessao.loja.definir({
    carregado: true,
    utilizador: { id: 'u-1', email: 'ana@exemplo.ao' },
    perfil,
    perfilLido: true,
    perfilConfirmadoAgora: true,
    nivel,
    acesso: decidirAcesso({
      perfil: { cargos, estadoKyc },
      nivel: nivel.atual,
      temFatorMfa: nivel.proximo === null ? null : nivel.proximo === 'aal2',
    }),
  });
}

const AAL1_SEM_FATOR: NivelSessao = { atual: 'aal1', proximo: 'aal1' };
const AAL1_COM_FATOR: NivelSessao = { atual: 'aal1', proximo: 'aal2' };
const AAL2: NivelSessao = { atual: 'aal2', proximo: 'aal2' };

const TODOS = ['Mapa', 'Guardados', 'Entrega', 'Minhas entregas', 'Campo', 'Validar', 'Gestão', 'Definições'];

function separadoresVisiveis(): string[] {
  return TODOS.filter((nome) => screen.queryAllByRole('button', { name: nome }).length > 0);
}

beforeEach(() => {
  sessao.loja.definir(estadoInicial());
  mockContarPendentes.mockReset();
  mockContarPendentes.mockResolvedValue(0);
  mockSair.mockClear();
  mockMarcarAvisoVisto.mockClear();
  mockFila = {};
});

// ─── Testes ────────────────────────────────────────────────────────────────

describe('arranque', () => {
  test('enquanto a sessão é lida, mostra "A abrir…"', () => {
    renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByText('A abrir…')).toBeTruthy();
  });

  test('sem sessão, vai para Entrar', async () => {
    sessao.loja.definir({ ...estadoInicial(), carregado: true });
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/entrar'));
    expect(screen.getByText('Criar conta')).toBeTruthy();
    expect(screen.getByText('Esqueci-me da palavra-passe')).toBeTruthy();
  });
});

describe('separadores', () => {
  test('cidadão vê mapa, guardados, entrega, minhas-entregas e definições', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(separadoresVisiveis()).toEqual(['Mapa', 'Guardados', 'Entrega', 'Minhas entregas', 'Definições']);
    expect(screen.getByText('Em construção.')).toBeTruthy();
  });

  test('técnico sem MFA ativado vai para o ecrã de ativar o MFA', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/mapa' });
    await waitFor(() => expect(r.getPathname()).toBe('/ativar-mfa'));
    expect(screen.getByText('Proteger a tua conta')).toBeTruthy();
    expect(screen.getByText('Sair')).toBeTruthy();
  });

  test('técnico com MFA ativado mas sessão AAL1 vai para o código', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL1_COM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/codigo-mfa'));
    expect(screen.getByText('Código de segurança')).toBeTruthy();
  });

  test('técnico verificado em AAL2 vê o separador Campo', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL2);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(separadoresVisiveis()).toEqual(['Mapa', 'Guardados', 'Campo', 'Definições']);
  });

  test('staff com KYC pendente vê o aviso fixo e só Mapa e Definições', async () => {
    comSessao(['supervisor'], 'PENDING', AAL2);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(
      screen.getByText(
        'A tua identidade ainda não foi verificada. Até lá só tens acesso ao Mapa e às Definições.',
      ),
    ).toBeTruthy();
    expect(separadoresVisiveis()).toEqual(['Mapa', 'Definições']);
  });

  test('cidadão não vê o aviso de KYC', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(screen.queryByText(/identidade ainda não foi verificada/)).toBeNull();
  });

  test('um separador não permitido não abre, nem por link', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/admin' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(screen.queryByText('Gestão')).toBeNull();
  });
});

describe('Definições → Sair', () => {
  test('com trabalhos por enviar, avisa antes de sair', async () => {
    mockContarPendentes.mockResolvedValue(3);
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));

    fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(
      await screen.findByText(
        'Tens 3 trabalhos por enviar. Se saíres, ficam guardados neste telemóvel e só são enviados ' +
          'quando voltares a entrar com esta conta. Antes de trocares de telemóvel, sincroniza tudo.',
      ),
    ).toBeTruthy();
    expect(mockContarPendentes).toHaveBeenCalledWith('u-1');
    expect(mockSair).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Sair na mesma' }));
    await waitFor(() => expect(mockSair).toHaveBeenCalledTimes(1));
  });

  test('sem trabalhos por enviar, sai logo', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(mockSair).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/por enviar\. Se saíres/)).toBeNull();
  });

  test('mostra a conta e o botão de diagnóstico', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL2);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    expect(screen.getByText('ana@exemplo.ao')).toBeTruthy();
    expect(screen.getByText('Técnico de campo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diagnóstico' })).toBeTruthy();
    expect(screen.getByText(/Angola Localiza, versão/)).toBeTruthy();
  });

  test('estado da sincronização, avisos com "Já vi" e falhas sem botão', async () => {
    mockFila = {
      pendentes: 2,
      fotosPendentes: 1,
      precisaEntrarDeNovo: true,
      operacoesComProblema: [
        { operation_id: 'op-a', operation_type: 'delivery_proof', gravidade: 'aviso', erro: 'Assinatura não confere', criado_em: '2026-09-23T10:00:00.000Z' },
        { operation_id: 'op-f', operation_type: 'field_submit', gravidade: 'falhou', erro: 'Foto alterada', criado_em: '2026-09-22T10:00:00.000Z' },
      ],
    };
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    expect(screen.getByText(/É preciso entrar de novo/)).toBeTruthy();
    expect(screen.getByText('Prova de entrega — enviado com aviso')).toBeTruthy();
    expect(screen.getByText('Levantamento de campo — não foi enviado')).toBeTruthy();
    // Só o aviso tem "Já vi".
    expect(screen.getAllByRole('button', { name: 'Já vi' })).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Já vi' }));
    expect(mockMarcarAvisoVisto).toHaveBeenCalledWith('op-a');
  });
});
