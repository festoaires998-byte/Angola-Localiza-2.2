import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { criarRepositorioEntregas } from '@/database/repositories/entregas';
import { criarRepositorioFilaSaida } from '@/database/repositories/filaSaida';
import { aplicarMigracoes } from '@/database/migrations';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import type { DadosEnvio, Envio, PedidoEnvio } from '@/domain/entregas/envio';

import { criarServicoEnvios } from './envios';

const EU = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002';
const MORADA = 'bbbbbbbb-0000-4000-8000-000000000001';
const dados: DadosEnvio = { moradaId: MORADA, destinatario: 'Maria', telefone: '923456789', instrucoes: '', urgente: false };

const envio = (id: string, extra: Partial<Envio> = {}): Envio => ({
  id,
  codigo: `COD-${id}`,
  estado: 'CREATED',
  destinatario: 'Maria',
  telefone: '+244 923 456 789',
  instrucoes: null,
  urgente: false,
  criadoPor: EU,
  estafeta: null,
  atualizadoEm: '2026-09-24T10:00:00.000Z',
  morada: { codigoPostal: 'AO-HUA-23456789-42', plusCode: null, referencia: null },
  ...extra,
});

let contadorOps = 0;

class ErroRede extends Error {
  estado = 0;
}

async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  const entregas = criarRepositorioEntregas(db);
  const fila = criarRepositorioFilaSaida(db, { deviceId: 'aparelho-1', gerarId: () => `op-${++contadorOps}` });
  const servidor = {
    criar: jest.fn(async (_p: PedidoEnvio) => ({ envio: envio('e1'), pin: { pin: '4821', expiraEm: null, bloqueado: false } })),
    listar: jest.fn(async (_u: string) => [envio('e1'), envio('e2', { estado: 'DELIVERED' })]),
    lerPin: jest.fn(async (_id: string) => ({ pin: '4821', expiraEm: null, bloqueado: false })),
    gerarPin: jest.fn(async (_id: string) => ({ pin: '1357', expiraEm: null, bloqueado: false })),
    cancelar: jest.fn(async (_id: string) => undefined),
  };
  const servico = criarServicoEnvios({
    servidor,
    entregas,
    fila: {
      acrescentar: (u, t, p) => fila.adicionar(u, t, p),
      porEnviar: (u, t) => fila.listarPorEnviarDoTipo(u, t),
    },
  });
  return { db, entregas, fila, servidor, servico };
}

let t: Awaited<ReturnType<typeof montar>>;
beforeEach(async () => {
  t = await montar();
});

describe('envios: enviar', () => {
  test('com rede: vai logo ao servidor, devolve o PIN e guarda o envio no telemóvel SEM o PIN', async () => {
    const r = await t.servico.enviar(EU, dados, true);
    expect(r).toEqual({ tipo: 'enviado', envio: envio('e1'), pin: { pin: '4821', expiraEm: null, bloqueado: false } });
    expect(t.servidor.criar).toHaveBeenCalledWith({
      address_id: MORADA,
      recipient_name: 'Maria',
      recipient_phone: '+244 923 456 789',
      instructions: null,
      is_urgent: false,
    });
    const guardadas = await t.entregas.listar();
    expect(guardadas.map((g) => g.id)).toEqual(['e1']);
    expect(JSON.stringify(guardadas)).not.toContain('4821');
    expect(await t.fila.listarPorEnviarDoTipo(EU, 'create_delivery')).toEqual([]);
  });

  test('sem rede: vai para a fila (create_delivery) com o mesmo pedido', async () => {
    const r = await t.servico.enviar(EU, dados, false);
    expect(r.tipo).toBe('na_fila');
    expect(t.servidor.criar).not.toHaveBeenCalled();
    const ops = await t.fila.listarPorEnviarDoTipo(EU, 'create_delivery');
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toMatchObject({ address_id: MORADA, recipient_name: 'Maria' });
    expect(await t.servico.porEnviar(EU)).toEqual([
      expect.objectContaining({ operationId: ops[0].operation_id, destinatario: 'Maria', erro: null }),
    ]);
  });

  test('a rede cai antes de chegar ao servidor: vai para a fila', async () => {
    t.servidor.criar.mockRejectedValueOnce(new ErroRede('Sem ligação ao servidor.'));
    expect((await t.servico.enviar(EU, dados, true)).tipo).toBe('na_fila');
  });

  test('o servidor recusa (ex.: identidade por verificar): o erro sobe e nada fica na fila', async () => {
    t.servidor.criar.mockRejectedValueOnce(Object.assign(new Error('CITIZEN_ID_NOT_VERIFIED: x'), { estado: 403 }));
    await expect(t.servico.enviar(EU, dados, true)).rejects.toThrow('CITIZEN_ID_NOT_VERIFIED');
    expect(await t.fila.listarPorEnviarDoTipo(EU, 'create_delivery')).toEqual([]);
  });

  test('pedido incompleto nem sai do telemóvel', async () => {
    await expect(t.servico.enviar(EU, { ...dados, moradaId: null }, true)).rejects.toThrow('Escolher a morada de destino.');
    expect(t.servidor.criar).not.toHaveBeenCalled();
  });
});

describe('envios: lista', () => {
  test('com rede vem do servidor e fica guardada; sem rede lê a guardada (só as do utilizador)', async () => {
    const online = await t.servico.listar(EU, true);
    expect(online).toMatchObject({ doServidor: true, erro: null });
    expect(online.envios.map((e) => e.id)).toEqual(['e1', 'e2']);
    await t.entregas.guardar({ id: 'alheia', estado: 'CREATED', dados: envio('alheia', { criadoPor: OUTRO }) });

    const offline = await t.servico.listar(EU, false);
    expect(offline.doServidor).toBe(false);
    expect(offline.envios.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    expect(offline.envios.find((e) => e.id === 'e2')).toEqual(envio('e2', { estado: 'DELIVERED' }));
  });

  test('o servidor falha: mostra a guardada e o erro', async () => {
    await t.servico.listar(EU, true);
    t.servidor.listar.mockRejectedValueOnce(new Error('Não foi possível ler os envios (x).'));
    const r = await t.servico.listar(EU, true);
    expect(r).toMatchObject({ doServidor: false, erro: 'Não foi possível ler os envios (x).' });
    expect(r.envios).toHaveLength(2);
  });
});

describe('envios: PIN e cancelar', () => {
  test('o PIN vem sempre do servidor', async () => {
    expect((await t.servico.lerPin('e1')).pin).toBe('4821');
    expect((await t.servico.gerarPin('e1')).pin).toBe('1357');
  });

  test('cancelar muda a cópia do telemóvel', async () => {
    await t.servico.listar(EU, true);
    const r = await t.servico.cancelar(envio('e1'));
    expect(r.estado).toBe('CANCELLED');
    expect(t.servidor.cancelar).toHaveBeenCalledWith('e1');
    expect((await t.servico.listar(EU, false)).envios.find((e) => e.id === 'e1')?.estado).toBe('CANCELLED');
  });
});
