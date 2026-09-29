import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioEntregas } from '@/database/repositories/entregas';
import { criarRepositorioFicheirosPendentes } from '@/database/repositories/ficheirosPendentes';
import { criarRepositorioFilaSaida } from '@/database/repositories/filaSaida';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import type { Envio } from '@/domain/entregas/envio';
import { proximoPasso, type DadosPod } from '@/domain/entregas/estafeta';

import { acoesDaEntrega, BUCKET_PROVAS, criarServicoEstafeta } from './estafeta';

const EU = 'aaaaaaaa-0000-4000-8000-000000000002';
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000009';
const local = { latitude: -12.7761, longitude: 15.7392, plusCode: '6GXV+2C' };

const entrega = (id: string, extra: Partial<Envio> = {}): Envio => ({
  id,
  codigo: `R-${id}`,
  estado: 'OUT_FOR_DELIVERY',
  destinatario: 'Maria',
  telefone: null,
  instrucoes: null,
  urgente: false,
  criadoPor: OUTRO,
  estafeta: EU,
  atualizadoEm: '2026-09-24T10:00:00.000Z',
  morada: null,
  ...extra,
});

let n = 0;
async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  const fila = criarRepositorioFilaSaida(db, { deviceId: 'aparelho-1', gerarId: () => `op-${++n}` });
  const ficheiros = criarRepositorioFicheirosPendentes(db, { gerarId: () => `f-${++n}` });
  const entregas = criarRepositorioEntregas(db);
  const assinarProva = jest.fn(async (_d: unknown) => ({
    crypto_payload: '{"versao":2}',
    crypto_signature: 'assinatura',
    crypto_algorithm: 'ECDSA-SHA256',
    crypto_device_id: 'aparelho-1',
  }));
  const servidor = {
    listarAtribuidas: jest.fn(async (_u: string) => [entrega('e1'), entrega('e2', { estado: 'DELIVERED' })]),
    listarDisponiveis: jest.fn(async () => ({
      pedidos: [],
      estafeta: { online: true, status: 'APPROVED', vehicle_type: 'MOTO', vehicle_capacity_kg: 20 },
    })),
    aceitar: jest.fn(async (_deliveryId: string) => undefined),
  };
  const servico = criarServicoEstafeta({
    servidor,
    entregas,
    fila: {
      acrescentar: (u, t, p) => fila.adicionar(u, t, p),
      porEnviar: (u, t) => fila.listarPorEnviarDoTipo(u, t),
      falhadas: (u) => fila.listarFalhadasDoUtilizador(u),
    },
    ficheiros,
    assinarProva,
  });
  return { fila, ficheiros, entregas, servidor, servico, assinarProva };
}

let t: Awaited<ReturnType<typeof montar>>;
beforeEach(async () => {
  t = await montar();
});

async function provaCompleta(): Promise<DadosPod> {
  const foto = await t.servico.guardarFicheiro({ uri: 'file:///foto.jpg', sha256: 'a'.repeat(64), tamanhoBytes: 1000 }, 'image/jpeg');
  const assinatura = await t.servico.guardarFicheiro({ uri: 'file:///assinatura.png', sha256: 'b'.repeat(64), tamanhoBytes: 300 }, 'image/png');
  return { pin: '4821', foto, assinatura, local, observacao: '', volumoso: false, esperaLonga: false };
}

describe('estafeta: prova de entrega sem rede', () => {
  test('foto e assinatura ficam registadas para o bucket privado delivery-proofs e ligadas à operação', async () => {
    const dados = await provaCompleta();
    const r = await t.servico.fechar(EU, entrega('e1'), dados);
    expect(r.assinadaPeloAparelho).toBe(true);

    const [op] = await t.fila.listarPorEnviarDoTipo(EU, 'delivery_proof');
    expect(op.operation_id).toBe(r.operationId);
    expect(op.payload).toMatchObject({
      delivery_id: 'e1',
      new_status: 'DELIVERED',
      pin: '4821',
      proof: {
        photo_url: dados.foto!.marcador,
        signature_url: dados.assinatura!.marcador,
        latitude: local.latitude,
        longitude: local.longitude,
        crypto_signature: 'assinatura',
        crypto_device_id: 'aparelho-1',
      },
    });
    for (const f of [dados.foto!, dados.assinatura!]) {
      const registo = await t.ficheiros.obter(f.marcador.replace('offline:', ''));
      expect(registo).toMatchObject({ bucket: BUCKET_PROVAS, operation_id: r.operationId });
    }
    const pngs = await t.ficheiros.obter(dados.assinatura!.marcador.replace('offline:', ''));
    expect(pngs?.content_type).toBe('image/png');
  });

  test('assina com o SHA-256 da foto e da assinatura desenhada e o local da prova', async () => {
    await t.servico.fechar(EU, entrega('e1'), await provaCompleta());
    expect(t.assinarProva).toHaveBeenCalledWith({
      delivery_id: 'e1',
      lat: local.latitude,
      lng: local.longitude,
      plus_code: '6GXV+2C',
      foto_sha256: 'a'.repeat(64),
      assinatura_manuscrita_sha256: 'b'.repeat(64),
    });
  });

  test('sem a chave do aparelho (ex.: cofre fechado), a prova segue sem a assinatura do aparelho', async () => {
    t.assinarProva.mockRejectedValueOnce(new Error('cofre fechado'));
    const r = await t.servico.fechar(EU, entrega('e1'), await provaCompleta());
    expect(r.assinadaPeloAparelho).toBe(false);
    const [op] = await t.fila.listarPorEnviarDoTipo(EU, 'delivery_proof');
    expect((op.payload as { proof: Record<string, unknown> }).proof.crypto_signature).toBeUndefined();
  });

  test('prova incompleta nem entra na fila', async () => {
    await expect(t.servico.fechar(EU, entrega('e1'), { ...(await provaCompleta()), pin: '' })).rejects.toThrow(/PIN/);
    expect(await t.fila.listarPorEnviarDoTipo(EU, 'delivery_proof')).toEqual([]);
  });
});

describe('estafeta: ações na fila', () => {
  test('etapas sem rede ficam pela ordem; o PIN errado aparece como recusado (e não volta a ser enviado)', async () => {
    await t.servico.avancar(EU, entrega('e3', { estado: 'PICKED_UP' }), proximoPasso('PICKED_UP')!, null, null);
    await t.servico.fechar(EU, entrega('e1'), await provaCompleta());
    const ids = (await t.fila.listarPorEnviarDoTipo(EU, 'delivery_proof')).map((o) => o.operation_id);
    await t.fila.marcarAEnviar(EU, ids);
    await t.fila.aplicarResultadosSync(EU, [
      { operation_id: ids[0], status: 'SYNCED' },
      { operation_id: ids[1], status: 'FAILED', error: 'PIN de confirmacao incorreto (restam 4 tentativas)' },
    ]);
    const acoes = await t.servico.acoes(EU);
    expect(acoes).toEqual([
      expect.objectContaining({ deliveryId: 'e1', novo: 'DELIVERED', erro: 'PIN de confirmacao incorreto (restam 4 tentativas)' }),
    ]);
    expect(await t.fila.listarPorEnviarDoTipo(EU, 'delivery_proof')).toEqual([]);
  });

  test('acoesDaEntrega: uma recusa antiga deixa de aparecer quando o servidor mudou depois', () => {
    const recusa = { deliveryId: 'e1', novo: 'DELIVERED', erro: 'PIN errado', criadaEm: '2026-09-24T10:00:00.000Z' };
    const aEspera = { deliveryId: 'e1', novo: 'FAILED', erro: null, criadaEm: '2026-09-24T09:00:00.000Z' };
    expect(acoesDaEntrega(entrega('e1', { atualizadoEm: '2026-09-24T09:30:00+00:00' }), [recusa, aEspera])).toEqual([recusa, aEspera]);
    expect(acoesDaEntrega(entrega('e1', { atualizadoEm: '2026-09-24T11:00:00+00:00' }), [recusa, aEspera])).toEqual([aEspera]);
    expect(acoesDaEntrega(entrega('e2'), [recusa])).toEqual([]);
  });
});

describe('estafeta: lista', () => {
  test('com rede vem do servidor e fica guardada; sem rede só as atribuídas a mim', async () => {
    expect((await t.servico.listar(EU, true)).entregas.map((e) => e.id)).toEqual(['e1', 'e2']);
    await t.entregas.guardar({ id: 'alheia', estado: 'ASSIGNED', dados: entrega('alheia', { estafeta: OUTRO }) });
    const offline = await t.servico.listar(EU, false);
    expect(offline.doServidor).toBe(false);
    expect(offline.entregas.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  test('o servidor falha: mostra as guardadas e o erro', async () => {
    await t.servico.listar(EU, true);
    t.servidor.listarAtribuidas.mockRejectedValueOnce(new Error('Não foi possível ler as entregas (x).'));
    const r = await t.servico.listar(EU, true);
    expect(r).toMatchObject({ doServidor: false, erro: 'Não foi possível ler as entregas (x).' });
    expect(r.entregas).toHaveLength(2);
  });
});

describe('estafeta: recolha e falha', () => {
  test('a recolha leva a foto (ligada à operação); a falha leva o motivo', async () => {
    const foto = await t.servico.guardarFicheiro({ uri: 'file:///r.jpg', sha256: 'c'.repeat(64), tamanhoBytes: 900 }, 'image/jpeg');
    const opRecolha = await t.servico.avancar(EU, entrega('e1', { estado: 'ASSIGNED' }), proximoPasso('ASSIGNED')!, foto, local);
    expect((await t.ficheiros.obter(foto.marcador.replace('offline:', '')))?.operation_id).toBe(opRecolha);
    await t.servico.falhar(EU, entrega('e1'), 'recusa', 'não quis', null, local);
    const ops = await t.fila.listarPorEnviarDoTipo(EU, 'delivery_proof');
    expect(ops.map((o) => (o.payload as { new_status: string }).new_status)).toEqual(['PICKED_UP', 'FAILED']);
    expect(ops[1].payload).toMatchObject({ reason: 'recusa', proof: { observation: 'não quis' } });
  });
});
