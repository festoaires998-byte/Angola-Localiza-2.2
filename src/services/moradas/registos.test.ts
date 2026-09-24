import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioFilaSaida } from '@/database/repositories/filaSaida';
import { criarRepositorioPreferencias } from '@/database/repositories/preferencias';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import type { Registo } from '@/domain/enderecamento/meusRegistos';

import { criarServicoRegistos } from './registos';

const EU = 'aaaaaaaa-0000-4000-8000-000000000001';
const registo = (id: string, extra: Partial<Registo> = {}): Registo => ({
  id,
  estado: 'por_validar',
  tipo: 'Casa',
  referencia: 'Portão Castanho',
  bairro: 'São Luís',
  enviadoEm: '2026-09-24T12:25:05Z',
  validadoEm: null,
  moradaId: null,
  codigoPostal: null,
  numeroPorta: null,
  ...extra,
});

let n = 0;
async function montar() {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  const fila = criarRepositorioFilaSaida(db, { deviceId: 'aparelho-1', gerarId: () => `op-${++n}` });
  const preferencias = criarRepositorioPreferencias(db);
  let doServidor: Registo[] = [registo('r1')];
  const juntar = jest.fn(async (_u: string, _m: string, _c: CategoriaFavorito, _n: string | null) => undefined);
  const lerMeusRegistos = jest.fn(async (_u: string) => doServidor);
  const servico = criarServicoRegistos({
    servidor: { lerMeusRegistos, juntarAosFavoritos: juntar },
    preferencias,
    fila: { porEnviar: (u) => fila.listarPorEnviarDoTipo(u, 'field_submit') },
  });
  return { fila, servico, juntar, lerMeusRegistos, mudar: (r: Registo[]) => (doServidor = r) };
}

let t: Awaited<ReturnType<typeof montar>>;
beforeEach(async () => {
  t = await montar();
});

describe('os meus registos: serviço', () => {
  test('o registo aprovado entra nos favoritos com a categoria do tipo — uma só vez', async () => {
    await t.servico.atualizar(EU);
    expect(t.juntar).not.toHaveBeenCalled();

    t.mudar([registo('r1', { estado: 'aprovado', moradaId: 'm1', codigoPostal: 'AO-1', numeroPorta: '7' })]);
    expect(await t.servico.atualizar(EU)).toEqual({ juntados: 1 });
    expect(t.juntar).toHaveBeenCalledWith(EU, 'm1', 'casa', 'Casa');

    // Se a pessoa depois tirar a morada dos favoritos, a app não a volta a pôr.
    expect(await t.servico.atualizar(EU)).toEqual({ juntados: 0 });
    expect(t.juntar).toHaveBeenCalledTimes(1);
  });

  test('se juntar falhar (sem rede a meio), tenta de novo na próxima vez', async () => {
    t.mudar([registo('r1', { estado: 'aprovado', moradaId: 'm1' })]);
    t.juntar.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await t.servico.atualizar(EU)).toEqual({ juntados: 0 });
    expect(await t.servico.atualizar(EU)).toEqual({ juntados: 1 });
  });

  test('a lista fica no telemóvel (abre sem rede), com os da fila primeiro', async () => {
    await t.servico.atualizar(EU);
    await t.fila.adicionar(EU, 'field_submit', { reference: '[Loja] Ao lado do mercado', neighborhood_name: 'Cidade Baixa' });
    const lista = await t.servico.listar(EU);
    expect(lista.map((r) => [r.estado, r.referencia])).toEqual([
      ['a_espera_rede', 'Ao lado do mercado'],
      ['por_validar', 'Portão Castanho'],
    ]);
  });

  test('sem nada guardado: lista vazia; erro do servidor sobe (a lista guardada fica)', async () => {
    expect(await t.servico.listar(EU)).toEqual([]);
    await t.servico.atualizar(EU);
    t.lerMeusRegistos.mockRejectedValueOnce(new Error('Não foi possível ler os teus registos (x).'));
    await expect(t.servico.atualizar(EU)).rejects.toThrow('Não foi possível ler os teus registos (x).');
    expect(await t.servico.listar(EU)).toHaveLength(1);
  });
});
