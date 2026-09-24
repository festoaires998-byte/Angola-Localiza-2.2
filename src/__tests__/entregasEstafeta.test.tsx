import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { Envio } from '@/domain/entregas/envio';
import type { DadosPod, FicheiroProva, LocalProva, Passo } from '@/domain/entregas/estafeta';
import type { AcaoNaFila } from '@/services/entregas/estafeta';

const EU = 'aaaaaaaa-0000-4000-8000-000000000002';
const entrega = (id: string, extra: Partial<Envio> = {}): Envio => ({
  id,
  codigo: `R-${id}`,
  estado: 'OUT_FOR_DELIVERY',
  destinatario: 'Maria João',
  telefone: '+244 923 456 789',
  instrucoes: 'Portão verde',
  urgente: false,
  criadoPor: 'remetente',
  estafeta: EU,
  atualizadoEm: '2026-09-24T10:00:00.000Z',
  morada: { codigoPostal: 'AO-HUA-23456789-42', plusCode: '6GXV+2C', referencia: 'Casa azul', latitude: -12.77, longitude: 15.73 },
  ...extra,
});

let mockEntregas: Envio[] = [];
let mockAcoes: AcaoNaFila[] = [];
let n = 0;
const ficheiro = (uri: string): FicheiroProva => ({ marcador: `offline:f${++n}`, sha256: 'a'.repeat(64), uri });
const mockAvancar = jest.fn(async (_u: string, _e: Envio, _p: Passo, _f: FicheiroProva | null, _l: LocalProva | null) => 'op-1');
const mockFechar = jest.fn(async (_u: string, _e: Envio, _d: DadosPod) => ({ operationId: 'op-2', assinadaPeloAparelho: true }));
const mockFalhar = jest.fn(async (..._a: unknown[]) => 'op-3');
jest.mock('@/services/entregas/estafetaApp', () => ({
  servicoEstafeta: {
    listar: async () => ({ entregas: mockEntregas, doServidor: true, erro: null }),
    acoes: async () => mockAcoes,
    guardarFicheiro: async (f: { uri: string }) => ficheiro(f.uri),
    avancar: (u: string, e: Envio, p: Passo, f: FicheiroProva | null, l: LocalProva | null) => mockAvancar(u, e, p, f, l),
    fechar: (u: string, e: Envio, d: DadosPod) => mockFechar(u, e, d),
    falhar: (...a: unknown[]) => mockFalhar(...a),
  },
}));

// Câmara, marca de água e PNG da assinatura precisam do telemóvel: aqui são simulados.
jest.mock('@/components/CamaraFachada', () => {
  const { Pressable, Text } = require('react-native');
  return {
  CamaraFachada: ({ foto, aoFotografar, rotuloFoto, podeFotografar }: { foto: string | null; aoFotografar(u: string): Promise<void>; rotuloFoto: string; podeFotografar: boolean }) =>
    foto ? (
      <Text>{`${rotuloFoto} pronta`}</Text>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fotografar: ${rotuloFoto}`}
        accessibilityState={{ disabled: !podeFotografar }}
        disabled={!podeFotografar}
        onPress={() => void aoFotografar('file:///camara.jpg')}
      >
        <Text>Fotografar</Text>
      </Pressable>
    ),
  };
});
jest.mock('@/components/AssinaturaDedo', () => {
  const { Pressable, Text } = require('react-native');
  return {
  AssinaturaDedo: ({ assinatura, aoConfirmar }: { assinatura: string | null; aoConfirmar(t: unknown, l: number, a: number): Promise<void> }) =>
    assinatura ? (
      <Text>Assinatura pronta</Text>
    ) : (
      <Pressable accessibilityRole="button" accessibilityLabel="Assinar (teste)" onPress={() => void aoConfirmar([[{ x: 0, y: 0 }, { x: 80, y: 0 }]], 300, 220)}>
        <Text>Assinar</Text>
      </Pressable>
    ),
  };
});
const mockMarca = jest.fn(async (uri: string, _l: [string, string], prefixo: string) => ({ uri: `${uri}#${prefixo}`, sha256: 'a'.repeat(64), tamanhoBytes: 5000 }));
jest.mock('@/services/imagem/fotoComMarca', () => ({
  fotoComMarcaDeAgua: (uri: string, l: [string, string], p: string) => mockMarca(uri, l, p),
}));
jest.mock('@/services/imagem/assinaturaPng', () => ({
  gravarAssinaturaPng: () => ({ uri: 'file:///assinatura.png', sha256: 'b'.repeat(64), tamanhoBytes: 300 }),
}));
const LOCAL = { latitude: -12.7761, longitude: 15.7392, plusCode: '6GXV+2C' };
let mockLocal: LocalProva | null = LOCAL;
jest.mock('@/hooks/useLocalProva', () => ({
  useLocalProva: () => ({ local: mockLocal, precisao: 4, fraca: false, texto: mockLocal ? 'Posição medida (± 4 m).' : 'A medir a posição…' }),
}));
let mockOnline: boolean | null = true;
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
let mockCargos: string[] = ['estafeta'];
jest.mock('@/hooks/useSessao', () => ({ useSessao: () => ({ utilizador: { id: EU }, perfil: { cargos: mockCargos } }) }));

type Ecra = { default: () => React.JSX.Element };
const rotas = {
  'minhas-entregas/_layout': (require('@/app/(tabs)/minhas-entregas/_layout') as Ecra).default,
  'minhas-entregas/index': (require('@/app/(tabs)/minhas-entregas/index') as Ecra).default,
  'minhas-entregas/[id]': (require('@/app/(tabs)/minhas-entregas/[id]') as Ecra).default,
  'minhas-entregas/prova': (require('@/app/(tabs)/minhas-entregas/prova') as Ecra).default,
  'minhas-entregas/falha': (require('@/app/(tabs)/minhas-entregas/falha') as Ecra).default,
};
const { lojaEstafeta, ESTADO_INICIAL_ESTAFETA } = require('@/state/estafeta') as typeof import('@/state/estafeta');

let r: ReturnType<typeof renderRouter>;
async function desenhar() {
  r = renderRouter(rotas, { initialUrl: '/minhas-entregas' });
  await act(async () => {});
}
async function carregar(nome: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: nome }));
  });
}
const desativado = (nome: string) => screen.getByRole('button', { name: nome }).props.accessibilityState.disabled;

beforeEach(() => {
  mockEntregas = [
    entrega('e1'),
    entrega('e2', { estado: 'ASSIGNED', destinatario: 'Bento', urgente: true }),
    entrega('e3', { estado: 'DELIVERED', destinatario: 'Carla' }),
  ];
  mockAcoes = [];
  mockLocal = LOCAL;
  mockOnline = true;
  mockCargos = ['estafeta'];
  lojaEstafeta.definir(ESTADO_INICIAL_ESTAFETA);
  [mockAvancar, mockFechar, mockFalhar, mockMarca].forEach((f) => f.mockClear());
});

describe('Entregas (estafeta): lista', () => {
  test('quem não é estafeta vê a explicação (e não se pede nada)', async () => {
    mockCargos = [];
    await desenhar();
    expect(screen.getByText('Aqui aparecem as entregas que fazes como estafeta.')).toBeTruthy();
    expect(screen.getByText('Os teus envios estão no separador Enviar.')).toBeTruthy();
  });

  test('as por fazer primeiro, com o estado e "Urgente"', async () => {
    await desenhar();
    expect(screen.getByText('2 por fazer')).toBeTruthy();
    const botoes = screen.getAllByRole('button', { name: /^Entrega para/ }).map((b) => b.props.accessibilityLabel);
    expect(botoes).toEqual([
      'Entrega para Maria João. Saiu para entrega',
      'Entrega para Bento. Com estafeta',
      'Entrega para Carla. Entregue',
    ]);
    expect(screen.getByText('Urgente')).toBeTruthy();
  });

  test('ações feitas sem rede mudam o estado e aparecem "À espera de rede"; recusas aparecem', async () => {
    mockAcoes = [
      { deliveryId: 'e2', novo: 'PICKED_UP', erro: null, criadaEm: '2026-09-24T11:00:00.000Z' },
      { deliveryId: 'e1', novo: 'DELIVERED', erro: 'PIN de confirmacao incorreto (restam 4 tentativas)', criadaEm: '2026-09-24T11:00:00.000Z' },
    ];
    await desenhar();
    expect(screen.getByRole('button', { name: 'Entrega para Bento. Recolhida' })).toBeTruthy();
    expect(screen.getByText('À espera de rede')).toBeTruthy();
    expect(screen.getByText('Recusada pelo servidor')).toBeTruthy();
  });
});

describe('Entregas (estafeta): recolha', () => {
  test('a recolha exige a foto com marca de água; depois vai para a fila', async () => {
    await desenhar();
    await carregar(/^Entrega para Bento/);
    expect(desativado('Recolhi a encomenda')).toBe(true);
    await carregar('Fotografar: Foto da recolha');
    expect(mockMarca).toHaveBeenCalledWith('file:///camara.jpg', [expect.stringContaining('📍 6GXV+2C · -12.77610, 15.73920'), expect.any(String)], 'recolha');
    expect(screen.getByText('Foto da recolha pronta')).toBeTruthy();
    await carregar('Recolhi a encomenda');
    expect(mockAvancar).toHaveBeenCalledWith(
      EU,
      expect.objectContaining({ id: 'e2' }),
      expect.objectContaining({ novo: 'PICKED_UP' }),
      expect.objectContaining({ uri: 'file:///camara.jpg#recolha' }),
      LOCAL,
    );
    expect(screen.getByText('"Recolhi a encomenda" registado. A enviar para o servidor…')).toBeTruthy();
  });

  test('sem GPS não abre a câmara (a marca de água precisa do local)', async () => {
    mockLocal = null;
    await desenhar();
    await carregar(/^Entrega para Bento/);
    expect(desativado('Fotografar: Foto da recolha')).toBe(true);
    await carregar('Fotografar: Foto da recolha');
    expect(mockMarca).not.toHaveBeenCalled();
  });
});

describe('Entregas (estafeta): prova de entrega', () => {
  async function abrirProva() {
    await desenhar();
    await carregar(/^Entrega para Maria João/);
    expect(screen.getByRole('button', { name: 'Ligar a Maria João' })).toBeTruthy();
    await carregar('Entregar (prova de entrega)');
  }

  test('"Falta:" até ter foto, assinatura e PIN; depois fecha pela fila e volta ao detalhe', async () => {
    await abrirProva();
    expect(desativado('Confirmar a entrega')).toBe(true);
    expect(screen.getByText(/Tirar a foto da entrega\./)).toBeTruthy();
    await carregar('Fotografar: Foto da entrega');
    await carregar('Assinar (teste)');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('PIN (4 algarismos)'), '48a21');
    });
    expect(desativado('Confirmar a entrega')).toBe(false);
    await carregar('Confirmar a entrega');
    const dados = mockFechar.mock.calls[0][2];
    expect(dados).toMatchObject({
      pin: '4821',
      local: LOCAL,
      foto: expect.objectContaining({ uri: 'file:///camara.jpg#entrega' }),
      assinatura: expect.objectContaining({ uri: 'file:///assinatura.png' }),
    });
    expect(r.getPathname()).toBe('/minhas-entregas/e1');
    expect(screen.getByText('Prova de entrega guardada e assinada por este telemóvel. A enviar para o servidor…')).toBeTruthy();
  });

  test('sem rede: a prova fica no telemóvel e o aviso diz isso', async () => {
    mockOnline = false;
    await abrirProva();
    expect(screen.getByText('Sem rede: a prova fica guardada neste telemóvel e é enviada quando a rede voltar.')).toBeTruthy();
    await carregar('Fotografar: Foto da entrega');
    await carregar('Assinar (teste)');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('PIN (4 algarismos)'), '4821');
    });
    await carregar('Confirmar a entrega');
    expect(screen.getByText(/Sem rede: fica guardado neste telemóvel/)).toBeTruthy();
  });

  test('PIN errado recusado pelo servidor: o detalhe explica e deixa fazer a prova de novo', async () => {
    mockAcoes = [{ deliveryId: 'e1', novo: 'DELIVERED', erro: 'PIN de confirmacao incorreto (restam 4 tentativas)', criadaEm: '2026-09-24T11:00:00.000Z' }];
    await desenhar();
    await carregar(/^Entrega para Maria João/);
    expect(screen.getByText(/O PIN estava errado \(restam 4 tentativas\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entregar (prova de entrega)' })).toBeTruthy();
  });
});

describe('Entregas (estafeta): não foi possível entregar', () => {
  test('motivo obrigatório; vai para a fila com o local', async () => {
    await desenhar();
    await carregar(/^Entrega para Maria João/);
    await carregar('Não foi possível entregar');
    expect(desativado('Registar que não foi possível')).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Motivo: Ninguém para receber' }));
    });
    await carregar('Registar que não foi possível');
    expect(mockFalhar).toHaveBeenCalledWith(EU, expect.objectContaining({ id: 'e1' }), 'destinatario_ausente', '', null, LOCAL);
    expect(r.getPathname()).toBe('/minhas-entregas/e1');
  });
});
