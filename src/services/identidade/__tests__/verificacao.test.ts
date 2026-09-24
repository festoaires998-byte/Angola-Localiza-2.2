import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioPreferencias } from '@/database/repositories/preferencias';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import { sha256Hex } from '@/services/imagem/hashFoto';

import type { EstadoCidadao } from '@/domain/identidade/verificacaoSimples';

import { chaveMotivoRecusa, chaveVerificado, criarServicoVerificacao, ERRO_FOTO_ALTERADA, type FotoVerificacao } from '../verificacao';

const EU = 'user-1';

async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  const preferencias = criarRepositorioPreferencias(db);
  const disco = new Map<string, Uint8Array>();
  const bucket = new Map<string, Uint8Array>();
  const deps = {
    preferencias,
    lerBytes: jest.fn(async (uri: string) => {
      const b = disco.get(uri);
      if (!b) throw new Error(`não existe: ${uri}`);
      return b;
    }),
    apagarFicheiro: jest.fn(async (uri: string) => void disco.delete(uri)),
    enviarFicheiro: jest.fn(async (nome: string, bytes: Uint8Array) => void bucket.set(nome, bytes)),
    submeter: jest.fn(
      async (_p: { id_photo_front_url: string; id_photo_back_url: string; selfie_url: string }): Promise<EstadoCidadao> => 'em_revisao',
    ),
    lerEstadoServidor: jest.fn(async (): Promise<{ estado: EstadoCidadao; motivo: string | null }> => ({ estado: 'em_revisao', motivo: null })),
    agora: () => 1_790_000_000_000,
  };
  const servico = criarServicoVerificacao(deps);
  const foto = (nome: string) => {
    const bytes = new TextEncoder().encode(`jpeg ${nome}`);
    disco.set(`file:///docs/fotos/${nome}.jpg`, bytes);
    return { uri: `file:///docs/fotos/${nome}.jpg`, sha256: sha256Hex(bytes) };
  };
  const fotos = (): Record<FotoVerificacao, { uri: string; sha256: string }> => ({
    frente: foto('frente'),
    verso: foto('verso'),
    selfie: foto('selfies'),
  });
  return { servico, deps, disco, bucket, preferencias, fotos };
}

describe('verificação simples: envio próprio (funciona sem rede)', () => {
  let t: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => {
    t = await montar();
  });

  test('sem pedido: "por fazer" e nada a enviar', async () => {
    expect(await t.servico.estado(EU)).toBe('por_fazer');
    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'nada_pendente' });
  });

  test('guardado sem rede fica "pendente"; com rede sobe as 3 fotos (bucket privado) e fica "em revisão"', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    expect(await t.servico.estado(EU)).toBe('pendente');

    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'em_revisao' });
    expect([...t.bucket.keys()].sort()).toEqual([
      `${EU}/cidadao-frente-1790000000000.jpg`,
      `${EU}/cidadao-selfie-1790000000000.jpg`,
      `${EU}/cidadao-verso-1790000000000.jpg`,
    ]);
    expect(t.deps.submeter).toHaveBeenCalledWith({
      id_photo_front_url: `${EU}/cidadao-frente-1790000000000.jpg`,
      id_photo_back_url: `${EU}/cidadao-verso-1790000000000.jpg`,
      selfie_url: `${EU}/cidadao-selfie-1790000000000.jpg`,
    });
    // Enviar NÃO aprova: fica à espera de um administrador.
    expect(await t.servico.estado(EU)).toBe('em_revisao');
    expect(await t.preferencias.obter(chaveVerificado(EU))).toBe('0');
    // As fotos do BI não ficam no telemóvel depois de entregues.
    expect(t.disco.size).toBe(0);
  });

  test('um administrador aprova: com rede a app fica a saber e guarda (o registo de moradas usa a mesma chave)', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    await t.servico.enviarPendente(EU);
    t.deps.lerEstadoServidor.mockResolvedValueOnce({ estado: 'verificado', motivo: null });
    await t.servico.atualizarDoServidor(EU);
    expect(await t.servico.estado(EU)).toBe('verificado');
    expect(await t.preferencias.obter(chaveVerificado(EU))).toBe('1');
  });

  test('um administrador recusa: fica "rejeitado" com o motivo; um pedido novo volta a "pendente"', async () => {
    t.deps.lerEstadoServidor.mockResolvedValueOnce({ estado: 'rejeitado', motivo: 'A foto do BI está desfocada.' });
    await t.servico.atualizarDoServidor(EU);
    expect(await t.servico.estado(EU)).toBe('rejeitado');
    expect(await t.servico.motivoRecusa(EU)).toBe('A foto do BI está desfocada.');

    await t.servico.guardarPedido(EU, t.fotos());
    expect(await t.servico.estado(EU)).toBe('pendente');
    await t.servico.enviarPendente(EU);
    expect(await t.servico.estado(EU)).toBe('em_revisao');
    expect(await t.preferencias.obter(chaveMotivoRecusa(EU))).toBeNull();
  });

  test('sem resposta do servidor fica o estado guardado', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    await t.servico.enviarPendente(EU);
    t.deps.lerEstadoServidor.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    await t.servico.atualizarDoServidor(EU);
    expect(await t.servico.estado(EU)).toBe('em_revisao');
  });

  test('servidor antigo que ainda aprova logo: fica verificado', async () => {
    t.deps.submeter.mockResolvedValueOnce('verificado');
    await t.servico.guardarPedido(EU, t.fotos());
    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'verificado' });
    expect(await t.servico.estado(EU)).toBe('verificado');
  });

  test('a rede cai a meio: na vez seguinte continua onde parou (não reenvia o que já subiu)', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    t.deps.enviarFicheiro.mockImplementationOnce(async (nome, bytes) => void t.bucket.set(nome, bytes));
    t.deps.enviarFicheiro.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'falhou', erro: 'Sem ligação ao servidor.' });
    expect(await t.servico.estado(EU)).toBe('pendente');
    expect(t.bucket.size).toBe(1);

    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'em_revisao' });
    // 1 (antes da falha) + 1 que falhou + 2 que faltavam = 4 chamadas; a frente não subiu duas vezes.
    expect(t.deps.enviarFicheiro).toHaveBeenCalledTimes(4);
    expect(t.deps.enviarFicheiro.mock.calls.filter(([n]) => String(n).includes('-frente-'))).toHaveLength(1);
  });

  test('se o servidor recusar, fica pendente (com o erro) e as fotos continuam no telemóvel', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    t.deps.submeter.mockRejectedValueOnce(new Error('foto da frente, do verso e a selfie sao todas obrigatorias'));
    expect(await t.servico.enviarPendente(EU)).toMatchObject({ resultado: 'falhou' });
    expect(await t.servico.estado(EU)).toBe('pendente');
    expect(t.disco.size).toBe(3);
  });

  test('foto alterada no telemóvel: não envia e pede para tirar de novo', async () => {
    const fotos = t.fotos();
    t.disco.set(fotos.verso.uri, new TextEncoder().encode('outra coisa'));
    await t.servico.guardarPedido(EU, fotos);
    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'falhou', erro: ERRO_FOTO_ALTERADA });
    expect(t.deps.submeter).not.toHaveBeenCalled();
  });

  test('dois gatilhos ao mesmo tempo: um só envio', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    const [a, b] = await Promise.all([t.servico.enviarPendente(EU), t.servico.enviarPendente(EU)]);
    expect(a).toEqual({ resultado: 'em_revisao' });
    expect(b).toEqual({ resultado: 'em_revisao' });
    expect(t.deps.submeter).toHaveBeenCalledTimes(1);
  });

  test('tirar as fotos de novo substitui o pedido e apaga as fotos antigas', async () => {
    const primeiras = t.fotos();
    await t.servico.guardarPedido(EU, primeiras);
    const novas = {
      frente: { ...primeiras.frente, uri: 'file:///docs/fotos/frente2.jpg' },
      verso: { ...primeiras.verso, uri: 'file:///docs/fotos/verso2.jpg' },
      selfie: { ...primeiras.selfie, uri: 'file:///docs/fotos/selfies2.jpg' },
    };
    await t.servico.guardarPedido(EU, novas);
    expect(t.disco.has(primeiras.frente.uri)).toBe(false);
  });

  test('guardar o mesmo pedido outra vez não apaga as fotos dele', async () => {
    const fotos = t.fotos();
    await t.servico.guardarPedido(EU, fotos);
    await t.servico.guardarPedido(EU, fotos);
    expect(t.disco.size).toBe(3);
    expect(await t.servico.enviarPendente(EU)).toEqual({ resultado: 'em_revisao' });
  });

  test('outra pessoa no mesmo telemóvel não herda a verificação', async () => {
    await t.servico.guardarPedido(EU, t.fotos());
    await t.servico.enviarPendente(EU);
    expect(await t.servico.estado('outra-pessoa')).toBe('por_fazer');
  });
});
