import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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
const mockGuardarNome = jest.fn(async (_nome: string) => undefined);
const mockCriarConta = jest.fn(async (_e: string, _p: string, _n: string, _r?: string) => ({ userId: 'u-9', precisaConfirmar: true }));
jest.mock('@/api/auth', () => ({
  sair: () => mockSair(),
  guardarNome: (nome: string) => mockGuardarNome(nome),
  criarConta: (e: string, p: string, n: string, r?: string) => mockCriarConta(e, p, n, r),
  // Nunca responde: os ecrãs de MFA ficam em "a preparar" (não é isso que se testa aqui).
  listarFatores: () => new Promise(() => undefined),
  removerFatoresPorVerificar: jest.fn(),
  inscreverTotp: jest.fn(),
  desafiarEVerificarTotp: jest.fn(),
  entrar: jest.fn(),
  eErroDeRede: () => false,
  ErroAuth: class ErroAuth extends Error {},
}));

jest.mock('@/services/rede/conectividade', () => ({ estaOnline: async () => true, subscrever: () => () => undefined }));
jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual<typeof import('@/testes/mocksMapa')>('@/testes/mocksMapa').maplibre);
jest.mock('@/services/mapas/mapaOffline', () => jest.requireActual<typeof import('@/testes/mocksMapa')>('@/testes/mocksMapa').mapaOffline);
jest.mock('@/hooks/usePosicao', () => ({ usePosicao: () => ({ estado: 'a_procurar', ultima: null, tentarDeNovo: () => undefined }) }));
jest.mock('@/hooks/useInfoLocal', () => ({ useInfoLocal: () => null }));
jest.mock('react-native-qrcode-svg', () => () => null);
// O Mapa pergunta pela verificação simples (base de dados do telemóvel).
jest.mock('@/services/moradas/registoApp', () => ({
  // Esta suite não testa a verificação simples; manter o pedido pendente evita
  // uma atualização assíncrona irrelevante do Mapa durante testes de navegação.
  servicoRegisto: { verificacao: () => new Promise<string>(() => undefined) },
}));
jest.mock('@/api/pesquisa', () => ({ pesquisarNoServidor: async () => [] }));
const mockMudarPais = jest.fn(async (codigo: string): Promise<{ ok: true; pais: string } | { ok: false; erro: string }> => ({ ok: true, pais: codigo }));
jest.mock('@/services/conta/mudarPaisApp', () => ({ mudarPaisDaConta: (codigo: string) => mockMudarPais(codigo) }));
jest.mock('@/services/moradas/moradasApp', () => ({
  servicoMoradas: { guardarDoMapa: async () => ({}), enviarPendentes: async () => ({ enviados: 0, erro: null }) },
  mudancasMoradas: { avisar: () => undefined, ouvir: () => () => undefined },
}));

// ─── Ajudas ────────────────────────────────────────────────────────────────

const { sessao } = jest.requireMock<{ sessao: { loja: { definir(e: EstadoSessao): void } } }>('@/state/sessao');
const { estadoInicial } = jest.requireActual<typeof import('@/state/criarSessao')>('@/state/criarSessao');

function comSessao(cargos: string[], estadoKyc: string | null, nivel: NivelSessao, nome: string | null = 'Ana Silva'): void {
  const perfil: PerfilLocal = {
    user_id: 'u-1',
    email: 'ana@exemplo.ao',
    cargos,
    estado_kyc: estadoKyc,
    confirmado_em: '2026-09-23T10:00:00.000Z',
  };
  sessao.loja.definir({
    carregado: true,
    utilizador: { id: 'u-1', email: 'ana@exemplo.ao', nome },
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

const TODOS = ['Mapa', 'Moradas', 'Enviar', 'Entregas', 'Campo', 'Validar', 'Gestão', 'Conta'];

function separadoresVisiveis(): string[] {
  return TODOS.filter((nome) => screen.queryAllByRole('button', { name: nome }).length > 0);
}

beforeEach(() => {
  sessao.loja.definir(estadoInicial());
  mockContarPendentes.mockReset();
  mockContarPendentes.mockResolvedValue(0);
  mockSair.mockClear();
  mockGuardarNome.mockClear();
  mockCriarConta.mockClear();
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
  test('cidadão vê Mapa, Moradas, Enviar, Entregas e Conta', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(separadoresVisiveis()).toEqual(['Mapa', 'Moradas', 'Enviar', 'Entregas', 'Conta']);
    expect(await screen.findByText('Onde estou')).toBeTruthy();
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
    expect(separadoresVisiveis()).toEqual(['Mapa', 'Moradas', 'Campo', 'Conta']);
  });

  test('staff com KYC pendente vê o aviso fixo e só Mapa e Conta', async () => {
    comSessao(['supervisor'], 'PENDING', AAL2);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
    expect(
      screen.getByText(
        'A tua identidade ainda não foi verificada. Até lá só tens acesso ao Mapa e à Conta.',
      ),
    ).toBeTruthy();
    expect(separadoresVisiveis()).toEqual(['Mapa', 'Conta']);
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

  test('cores novas: título em faixa, secções com ícone e separador ativo destacado', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    // O título "Conta" fica numa faixa verde com letra branca.
    const titulo = screen.getByRole('header', { name: 'Conta' });
    expect(StyleSheet.flatten(titulo.props.style).color).toBe('#FFFFFF');
    // As secções têm o título com ícone (continuam a ser cabeçalhos).
    for (const nome of ['A tua conta', 'País da conta', 'Motorista', 'Verificação simples', 'Notificações', 'Sincronização', 'Ajuda']) {
      expect(screen.getByRole('header', { name: nome })).toBeTruthy();
    }
    // O separador ativo fica numa pastilha amarelo-sol (a barra desenha a camada
    // ativa de cada separador e mostra só a do separador aberto).
    const pastilha = screen.getAllByTestId('aba-ativa-definicoes')[0];
    expect(StyleSheet.flatten(pastilha.props.style).backgroundColor).toBe('#FFE9A8');
  });

  test('"Apagar a minha conta" abre o ecrã de confirmação', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    fireEvent.press(screen.getByRole('button', { name: 'Apagar a minha conta' }));
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes/apagar-conta'));
    expect(screen.getByText(/não tem volta atrás/)).toBeTruthy();
  });

  test('"Política de privacidade" abre a página do site', async () => {
    const { Linking } = require('react-native') as typeof import('react-native');
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    fireEvent.press(screen.getByRole('button', { name: 'Política de privacidade' }));
    expect(abrir).toHaveBeenCalledWith('https://festoaires998-byte.github.io/Huambo-Localiza-/privacidade.html');
    abrir.mockRestore();
  });

  test('país da conta: mostra a bandeira e só muda depois do aviso', async () => {
    mockMudarPais.mockClear();
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    expect(screen.getByText('🇦🇴 Angola')).toBeTruthy();
    // Já não há os botões soltos com siglas.
    expect(screen.queryByRole('button', { name: 'MZ' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Mudar de país' }));
    expect(screen.queryByRole('button', { name: '🇦🇴 Angola' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '🇲🇿 Moçambique' }));
    expect(screen.getByText('Mudar para 🇲🇿 Moçambique?')).toBeTruthy();
    expect(screen.getByText(/As moradas que já guardaste não mudam/)).toBeTruthy();
    expect(mockMudarPais).not.toHaveBeenCalled();

    // Cancelar não muda nada.
    fireEvent.press(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    expect(mockMudarPais).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: '🇲🇿 Moçambique' }));
    fireEvent.press(screen.getByRole('button', { name: 'Sim, mudar para Moçambique' }));
    expect(await screen.findByText('País da conta mudado para Moçambique.')).toBeTruthy();
    expect(mockMudarPais).toHaveBeenCalledWith('MZ');
    expect(screen.getByText('🇲🇿 Moçambique')).toBeTruthy();
  });

  test('país da conta: se o servidor recusar, mostra o erro e o país fica', async () => {
    mockMudarPais.mockResolvedValueOnce({ ok: false, erro: 'Sem internet. Para mudar o país da conta precisas de rede.' });
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    fireEvent.press(screen.getByRole('button', { name: 'Mudar de país' }));
    fireEvent.press(screen.getByRole('button', { name: '🇨🇻 Cabo Verde' }));
    fireEvent.press(screen.getByRole('button', { name: 'Sim, mudar para Cabo Verde' }));
    expect(await screen.findByText('Sem internet. Para mudar o país da conta precisas de rede.')).toBeTruthy();
    expect(screen.getByText('🇦🇴 Angola')).toBeTruthy();
  });

  test('país da conta: o pessoal com cargo não muda sozinho', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL2);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    expect(screen.getByText('🇦🇴 Angola')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mudar de país' })).toBeNull();
    expect(screen.getByText(/para mudar de país, pede a um administrador/)).toBeTruthy();
  });

  test('Aparência: escolher "Escuro" muda as cores da app na hora', async () => {
    const { escolherTema } = jest.requireActual<typeof import('@/state/tema')>('@/state/tema');
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    const fundoCartao = () => StyleSheet.flatten(screen.getByRole('header', { name: 'Aparência' }).props.style).color;
    expect(fundoCartao()).toBe('#111111');
    fireEvent.press(screen.getByRole('button', { name: 'Escuro' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ Escuro' })).toBeTruthy());
    expect(fundoCartao()).toBe('#ECF2EE');
    await act(async () => { await escolherTema('auto'); });
    expect(screen.getByRole('button', { name: '✓ Automático' })).toBeTruthy();
  });

  test('verificação simples: o botão aparece ao cidadão e não ao pessoal com cargo', async () => {
    comSessao([], null, AAL1_SEM_FATOR);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    expect(screen.getByRole('button', { name: 'Verificação simples' })).toBeTruthy();
  });

  test('pessoal com cargo não vê a verificação simples (tem a sua própria)', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL2);
    const r = renderRouter('./src/app', { initialUrl: '/definicoes' });
    await waitFor(() => expect(r.getPathname()).toBe('/definicoes'));
    expect(screen.queryByRole('button', { name: 'Verificação simples' })).toBeNull();
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

describe('nome completo obrigatório', () => {
  test('conta antiga sem nome: a app pede o nome antes de abrir o resto (nem por link)', async () => {
    comSessao([], null, AAL1_SEM_FATOR, null);
    const r = renderRouter('./src/app', { initialUrl: '/mapa' });
    await waitFor(() => expect(r.getPathname()).toBe('/o-teu-nome'));
    expect(screen.getByText('Como te chamas?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mapa' })).toBeNull();
  });

  test('guardar: valida o nome (nome e apelido) e só então o grava na conta', async () => {
    comSessao([], null, AAL1_SEM_FATOR, null);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/o-teu-nome'));
    fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Ana');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar e continuar' }));
    expect(await screen.findByText('Escreve o nome e o apelido (ex.: Ana Silva).')).toBeTruthy();
    expect(mockGuardarNome).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Nome completo'), '  Ana   Maria Silva ');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar e continuar' }));
    await waitFor(() => expect(mockGuardarNome).toHaveBeenCalledWith('  Ana   Maria Silva '));
  });

  test('depois de guardar (a sessão passa a ter nome), segue para o mapa', async () => {
    comSessao([], null, AAL1_SEM_FATOR, null);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/o-teu-nome'));
    // A sessão muda com a app aberta (como o USER_UPDATED do Supabase): dentro de act.
    await act(async () => {
      comSessao([], null, AAL1_SEM_FATOR, 'Ana Silva');
    });
    await waitFor(() => expect(r.getPathname()).toBe('/mapa'));
  });

  test('o código MFA vem primeiro; o nome a seguir', async () => {
    comSessao(['tecnico_campo'], 'ID_VERIFIED', AAL1_COM_FATOR, null);
    const r = renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(r.getPathname()).toBe('/codigo-mfa'));
  });

  test('criar conta: o nome completo é obrigatório e vai para a conta', async () => {
    sessao.loja.definir({ ...estadoInicial(), carregado: true });
    const r = renderRouter('./src/app', { initialUrl: '/criar-conta' });
    await waitFor(() => expect(r.getPathname()).toBe('/criar-conta'));
    expect(screen.getByRole('button', { name: '🇲🇿 Moçambique — Moçambique Localiza' })).toBeTruthy();
    expect(screen.getByText('O país fica associado à tua conta. Podes mudá-lo depois em Conta.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@exemplo.ao');
    fireEvent.changeText(screen.getByLabelText('Palavra-passe (mínimo 6 caracteres)'), 'segredo1');
    fireEvent.changeText(screen.getByLabelText('Repete a palavra-passe'), 'segredo1');
    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Escreve o teu nome completo.')).toBeTruthy();
    expect(mockCriarConta).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Ana Silva');
    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() =>
      expect(mockCriarConta).toHaveBeenCalledWith('ana@exemplo.ao', 'segredo1', 'Ana Silva', expect.stringContaining('email-confirmado')),
    );
  });
});
