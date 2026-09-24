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

import { criarServicoRegisto } from '../registo';

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
      lerRuasDaQuadra({ quadra_code: codigoQuadra(lat, lng), streets: [{ id: 'r1', name: 'Rua da Missão' }, { id: 'r2', name: 'Rua A' }] }),
    ),
    procurarDuplicado: jest.fn(async (_lat: number, _lng: number) => lerDuplicado({ found: true, distance_meters: 8.4, postal_code: 'AO-HUA-X' })),
    lerVerificacaoCidadao: jest.fn(async (_u: string) => true),
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
      ruas: [{ id: 'a', nome: 'Rua A' }],
    });
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

  test('ruas: com rede vêm do servidor e ficam guardadas; sem rede usa as guardadas', async () => {
    expect(await t.servico.ruasPerto(CENTRO.latitude, CENTRO.longitude, true)).toEqual({
      ruas: [{ id: 'r1', nome: 'Rua da Missão' }, { id: 'r2', nome: 'Rua A' }],
      doServidor: true,
    });
    const semRede = await t.servico.ruasPerto(CENTRO.latitude, CENTRO.longitude, false);
    expect(semRede.doServidor).toBe(false);
    expect(semRede.ruas.map((r) => r.nome)).toEqual(['Rua A', 'Rua da Missão']);
    // Outra quadra, sem nada guardado.
    expect((await t.servico.ruasPerto(CENTRO.latitude + 0.01, CENTRO.longitude, false)).ruas).toEqual([]);
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
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce(false);
    expect(await t.servico.verificacao('u1', true)).toBe('por_verificar');
    expect(await t.servico.verificacao('u1', false)).toBe('por_verificar');
    expect(await t.servico.verificacao('outra-pessoa', false)).toBe('desconhecido');
  });

  test('verificação guardada no telemóvel à espera de rede: "pendente" (pode registar)', async () => {
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce(false);
    expect(await t.servico.verificacao('u1', true)).toBe('por_verificar');
    await t.preferencias.guardar('verificacao_pendente:u1', '{}');
    t.servidor.lerVerificacaoCidadao.mockResolvedValueOnce(false);
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
      ruaId: null,
      ruaNome: 'Rua Nova',
      referencia: 'Portão azul',
      foto,
      duplicadoConfirmado: false,
      haDuplicado: false,
    };
    const { operationId, pedido } = await t.servico.enviar('u1', dados);
    const op = await t.fila.obter(operationId);
    expect(op).toMatchObject({ operation_type: 'field_submit', estado: 'pendente', user_id: 'u1' });
    expect(op!.payload).toEqual(pedido);
    expect(pedido).toMatchObject({ device_id: 'dispositivo-1', street_name: 'Rua Nova', photo_facade_url: foto });
    const f = await t.ficheiros.obter(foto.slice('offline:'.length));
    expect(f).toMatchObject({ bucket: 'field-photos', content_type: 'image/jpeg', operation_id: operationId, sha256: 'ab'.repeat(32) });
  });

  test('enviar sem o que falta não põe nada na fila', async () => {
    const dados = {
      captura: null,
      escolhaCelula: null,
      tipo: null,
      ruaId: null,
      ruaNome: '',
      referencia: '',
      foto: null,
      duplicadoConfirmado: false,
      haDuplicado: false,
    };
    await expect(t.servico.enviar('u1', dados)).rejects.toThrow(/medição/);
    expect(await t.fila.contarPendentesDoUtilizador('u1')).toBe(0);
  });
});
