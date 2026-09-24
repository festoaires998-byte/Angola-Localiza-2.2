import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { codigoQuadra, lerDuplicado, lerRuasDaQuadra } from '@/api/registoNucleo';
import { aplicarMigracoes } from '@/database/migrations';
import {
  criarRepositorioFicheirosPendentes,
  criarRepositorioFilaSaida,
  criarRepositorioPreferencias,
  criarRepositorioReferencias,
} from '@/database/repositories';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import { limitesCelula } from '@/domain/enderecamento/codigoPostal';
import type { DadosRegisto } from '@/domain/enderecamento/registoMorada';

import type { EstadoCidadao } from '@/domain/identidade/verificacaoSimples';

import { criarServicoRegisto, podeRegistar } from '../registo';

const c = limitesCelula(-12.7761, 15.7392);
const CENTRO = { latitude: (c.latMin + c.latMax) / 2, longitude: (c.lngMin + c.lngMax) / 2 };

async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  let n = 0;
  const gerarId = () => `id-${++n}`;
  const fila = criarRepositorioFilaSaida(db, { deviceId: 'dispositivo-1', gerarId });
  const ficheiros = criarRepositorioFicheirosPendentes(db, { gerarId });
  const referencias = criarRepositorioReferencias(db);
  const preferencias = criarRepositorioPreferencias(db);
  const servidor = {
    pedirRuasDaQuadra: jest.fn(async (lat: number, lng: number) =>
      lerRuasDaQuadra({
        quadra_code: codigoQuadra(lat, lng),
        streets: [{ id: 'r1', name: 'Rua da Missão' }, { id: 'r2', name: 'Rua A' }],
        neighborhoods_nearby: ['Académico', 'Cidade Alta'],
        quadra_id: 'quadra-uuid-1',
      }),
    ),
    procurarDuplicado: jest.fn(async (_lat: number, _lng: number) => lerDuplicado({ found: true, distance_meters: 8.4, postal_code: 'AO-HUA-X' })),
    lerVerificacaoCidadao: jest.fn(async (_u: string): Promise<EstadoCidadao> => 'verificado'),
  };
  const servico = criarServicoRegisto({
    ficheiros,
    acrescentarOperacao: (u, tipo, payload) => fila.adicionar(u, tipo, payload),
    idDispositivo: async () => 'dispositivo-1',
    referencias,
    preferencias,
    servidor,
  });
  return { servico, servidor, fila, ficheiros, preferencias };
}

describe('ler as respostas do field-service', () => {
  test('ruas da quadra (ignora linhas sem id ou nome)', () => {
    expect(lerRuasDaQuadra({ quadra_code: 'Q1-2', streets: [{ id: 'a', name: 'Rua A' }, { id: 'b' }] })).toEqual({
      quadra: 'Q1-2',
      quadraMapeada: false,
      ruas: [{ id: 'a', nome: 'Rua A' }],
      bairros: [],
    });
    // A função só manda quadra_id quando a quadra já existe (está delimitada).
    expect(lerRuasDaQuadra({ quadra_code: 'Q1-2', quadra_id: 'uuid', streets: [] }).quadraMapeada).toBe(true);
    // Bairros perto: sem vazios nem repetidos, pela ordem do servidor (mais usados primeiro).
    expect(
      lerRuasDaQuadra({ quadra_code: 'Q1-2', streets: [], neighborhoods_nearby: ['Académico', ' ', 'Académico', 7, 'Cidade Alta'] }).bairros,
    ).toEqual(['Académico', 'Cidade Alta']);
    expect(() => lerRuasDaQuadra({ error: 'sessao invalida' })).toThrow(/sessao/);
  });

  test('duplicado', () => {
    expect(lerDuplicado({ found: false })).toBeNull();
    expect(lerDuplicado({ found: true, distance_meters: 3, postal_code: 'AO-X' })).toEqual({ distanciaM: 3, codigoPostal: 'AO-X' });
  });

  test('código da quadra igual ao do servidor', () => {
    expect(codigoQuadra(-12.7761, 15.7392)).toBe(`Q${Math.floor(-12.7761 / 0.001082)}-${Math.floor(15.7392 / 0.001096)}`);
  });
});

describe('registar uma morada', () => {
  let t: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => {
    t = await montar();
  });

  test('ruas e bairros: com rede vêm do servidor e ficam guardados; sem rede usa os guardados', async () => {
    expect(await t.servico.ruasPerto(CENTRO.latitude, CENTRO.longitude, true)).toEqual({
      ruas: [{ id: 'r1', nome: 'Rua da Missão' }, { id: 'r2', nome: 'Rua A' }],
      bairros: ['Académico', 'Cidade Alta'],
      quadra: { codigo: codigoQuadra(CENTRO.latitude, CENTRO.longitude), mapeada: true },
      doServidor: true,
    });
    const semRede = await t.servico.ruasPerto(CENTRO.latitude, CENTRO.longitude, false);
    expect(semRede.doServidor).toBe(false);
    expect(semRede.ruas.map((r) => r.nome)).toEqual(['Rua A', 'Rua da Missão']);
    expect(semRede.bairros).toEqual(['Académico', 'Cidade Alta']);
    // Sem rede, lembra-se de que a quadra está delimitada.
    expect(semRede.quadra).toEqual({ codigo: codigoQuadra(CENTRO.latitude, CENTRO.longitude), mapeada: true });
    // Outra quadra, sem nada guardado: nem ruas, nem quadra delimitada conhecida.
    const outra = await t.servico.ruasPerto(CENTRO.latitude + 0.01, CENTRO.longitude, false);
    expect(outra.ruas).toEqual([]);
    expect(outra.quadra).toEqual({ codigo: codigoQuadra(CENTRO.latitude + 0.01, CENTRO.longitude), mapeada: false });
  });

  test('quadra ainda não delimitada no servidor: não fica guardada como delimitada', async () => {
    t.servidor.pedirRuasDaQuadra.mockImplementationOnce(async (lat: number, lng: number) =>
      lerRuasDaQuadra({ quadra_code: codigoQuadra(lat, lng), streets: [] }),
    );
    const r = await t.servico.ruasPerto(CENTRO.latitude, CENTRO.longitude, true);
    expect(r.quadra.mapeada).toBe(false);
    expect((await t.servico.ruasPerto(CENTRO.latitude, CENTRO.longitude, false)).quadra.mapeada).toBe(false);
  });

  test('duplicado: só com rede; se o servidor falhar, "não se sabe"', async () => {
    expect(await t.servico.duplicadoPerto(1, 2, false)).toBeUndefined();
    expect(await t.servico.duplicadoPerto(1, 2, true)).toEqual({ distanciaM: 8.4, codigoPostal: 'AO-HUA-X' });
    t.servidor.procurarDuplicado.mockRejectedValueOnce(new Error('sem rede'));
    expect(await t.servico.duplicadoPerto(1, 2, true)).toBeUndefined();
  });

  test('verificação do cidadão: com rede pergunta e guarda; sem rede usa a guardada', async () => {
    expect(await t.servico.verificacao('u1', false)).toBe('desconhecido');
    expect(await t.servico.verificacao('u1', true)).toBe('verificado');
    expect(await t.servico.verificacao('u1', false)).toBe('verificado');
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce('por_verificar');
    expect(await t.servico.verificacao('u1', true)).toBe('por_verificar');
    expect(await t.servico.verificacao('u1', false)).toBe('por_verificar');
    expect(await t.servico.verificacao('outra-pessoa', false)).toBe('desconhecido');
  });

  test('em revisão e recusada: guardadas para sem rede; só "verificado" (ou sem resposta) deixa registar', async () => {
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce('em_revisao');
    expect(await t.servico.verificacao('u1', true)).toBe('em_revisao');
    expect(await t.servico.verificacao('u1', false)).toBe('em_revisao');
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce('rejeitado');
    expect(await t.servico.verificacao('u1', true)).toBe('rejeitado');
    expect(await t.servico.verificacao('u1', false)).toBe('rejeitado');
    // Aprovada depois: passa a verificado, também sem rede.
    expect(await t.servico.verificacao('u1', true)).toBe('verificado');
    expect(await t.servico.verificacao('u1', false)).toBe('verificado');

    expect(podeRegistar('verificado')).toBe(true);
    expect(podeRegistar('desconhecido')).toBe(true);
    for (const v of ['em_revisao', 'rejeitado', 'pendente', 'por_verificar', null] as const) expect(podeRegistar(v)).toBe(false);
  });

  test('verificação guardada no telemóvel à espera de rede: "pendente" (ainda não pode registar)', async () => {
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce('por_verificar');
    expect(await t.servico.verificacao('u1', true)).toBe('por_verificar');
    await t.preferencias.guardar('verificacao_pendente:u1', '{}');
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce('rejeitado');
    expect(await t.servico.verificacao('u1', true)).toBe('pendente');
    expect(await t.servico.verificacao('u1', false)).toBe('pendente');
  });

  test('enviar: vai para a fila como field_submit, com a foto ligada à operação', async () => {
    const foto = await t.servico.guardarFoto({ uri: 'file:///docs/fotos/f1.jpg', sha256: 'ab'.repeat(32), tamanhoBytes: 123456 });
    expect(foto).toMatch(/^offline:/);
    const dados: DadosRegisto = {
      captura: { ...CENTRO, precisao: 4, leituras: 6, fraca: false },
      escolhaCelula: null,
      tipo: 'Casa',
      tipoOutro: '',
      ruaId: null,
      ruaNome: 'Rua Nova',
      ruaSemNome: false,
      bairro: 'Cidade Alta',
      bairroSemNome: false,
      referencia: 'Portão azul',
      foto,
      duplicadoConfirmado: false,
      haDuplicado: false,
    };
    const { operationId, pedido } = await t.servico.enviar('u1', dados);
    const op = await t.fila.obter(operationId);
    expect(op).toMatchObject({ operation_type: 'field_submit', estado: 'pendente', user_id: 'u1' });
    expect(op!.payload).toEqual(pedido);
    expect(pedido).toMatchObject({ device_id: 'dispositivo-1', street_name: 'Rua Nova', neighborhood_name: 'Cidade Alta', photo_facade_url: foto });
    const f = await t.ficheiros.obter(foto.slice('offline:'.length));
    expect(f).toMatchObject({ bucket: 'field-photos', content_type: 'image/jpeg', operation_id: operationId, sha256: 'ab'.repeat(32) });
  });

  test('enviar sem o que falta não põe nada na fila', async () => {
    const dados = {
      captura: null,
      escolhaCelula: null,
      tipo: null,
      tipoOutro: '',
      ruaId: null,
      ruaNome: '',
      ruaSemNome: false,
      bairro: '',
      bairroSemNome: false,
      referencia: '',
      foto: null,
      duplicadoConfirmado: false,
      haDuplicado: false,
    };
    await expect(t.servico.enviar('u1', dados)).rejects.toThrow(/medição/);
    expect(await t.fila.contarPendentesDoUtilizador('u1')).toBe(0);
  });
});
