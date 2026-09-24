import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { lerDadosMorada, lerFavoritosDoServidor, type FavoritoDoServidor } from '@/api/moradasNucleo';
import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioFavoritos } from '@/database/repositories/favoritos';
import { criarRepositorioMoradas } from '@/database/repositories/moradas';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';

import { criarServicoMoradas, ultimaAtualizacao, type NovoFavoritoComMorada } from '../moradas';

const EU = 'user-1';
const OUTRO = 'user-2';

/** Linha como o PostgREST a devolve. */
function linha(id: string, extra: Record<string, unknown> = {}, morada: Record<string, unknown> = {}) {
  return {
    id,
    category: 'casa',
    label: null,
    created_at: `2026-09-2${id.slice(-1)}T10:00:00.000Z`,
    address_id: `m-${id}`,
    addresses: {
      id: `m-${id}`,
      postal_code: 'AO-HUA-MNFQPN2S-3-95',
      plus_code: '5FVQ5PWV+PH5',
      latitude: -12.7761,
      longitude: 15.7392,
      accuracy_meters: 4,
      reference: 'Portão azul',
      house_number: null,
      status: 'PROPOSED',
      visibility_level: 'PUBLIC',
      created_at: '2026-09-20T10:00:00.000Z',
      updated_at: '2026-09-21T10:00:00.000Z',
      provinces: { name: 'Huambo' },
      municipalities: { name: 'Huambo' },
      ...morada,
    },
    ...extra,
  };
}

async function montar(linhasServidor: unknown[]) {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  let agora = new Date('2026-09-24T08:00:00.000Z');
  const favoritos = criarRepositorioFavoritos(db, () => agora);
  const moradas = criarRepositorioMoradas(db);
  const servidor = {
    linhas: linhasServidor,
    lerFavoritos: jest.fn(async (): Promise<FavoritoDoServidor[]> =>
      lerFavoritosDoServidor(servidor.linhas, agora.toISOString()),
    ),
    atualizarFavorito: jest.fn(async (_id: string, _m: { nome: string; categoria: string }) => undefined),
    removerFavorito: jest.fn(async (_id: string) => undefined),
    criarFavoritoComMorada: jest.fn(async (_userId: string, _novo: NovoFavoritoComMorada) => undefined),
  };
  let n = 0;
  const servico = criarServicoMoradas({
    favoritos,
    moradas,
    servidor,
    gerarId: () => `id-${++n}`,
    agora: () => agora,
  });
  return { servico, servidor, favoritos, avancar: (ms: number) => (agora = new Date(agora.getTime() + ms)) };
}

describe('ler os favoritos do servidor', () => {
  test('lê o favorito, a morada, a província e o município', () => {
    const [r] = lerFavoritosDoServidor([linha('f1', { label: ' Casa da avó ', category: 'familia' })], 'agora');
    expect(r.favorito).toMatchObject({ id: 'f1', morada_id: 'm-f1', nome: 'Casa da avó', categoria: 'familia' });
    expect(r.morada).toMatchObject({
      codigo_postal: 'AO-HUA-MNFQPN2S-3-95',
      plus_code: '5FVQ5PWV+PH5',
      provincia: 'Huambo',
      municipio: 'Huambo',
      estado: 'PROPOSED',
      origem: 'servidor',
      precisao_m: 4,
    });
    expect(lerDadosMorada(r.morada.dados)).toEqual({
      referencia: 'Portão azul',
      numero_porta: null,
      visibilidade: 'PUBLIC',
      criada_em: '2026-09-20T10:00:00.000Z',
    });
  });

  test('ignora favoritos sem morada visível ou sem coordenadas; categoria estranha vira "outro"', () => {
    const r = lerFavoritosDoServidor(
      [
        linha('f1', { addresses: null }),
        linha('f2', {}, { latitude: null }),
        linha('f3', { category: 'inventada' }),
      ],
      'agora',
    );
    expect(r.map((x) => x.favorito.id)).toEqual(['f3']);
    expect(r[0].favorito.categoria).toBe('outro');
  });

  test('resposta que não é uma lista dá erro', () => {
    expect(() => lerFavoritosDoServidor({ message: 'erro' }, 'agora')).toThrow(/inesperada/);
  });
});

describe('Moradas: telemóvel + servidor', () => {
  let t: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => {
    t = await montar([linha('f1'), linha('f2', { category: 'trabalho', label: 'Escritório' })]);
  });

  test('sem ter atualizado: lista vazia (e não pede nada ao servidor)', async () => {
    expect(await t.servico.listar(EU)).toEqual([]);
    expect(t.servidor.lerFavoritos).not.toHaveBeenCalled();
  });

  test('com rede: traz os favoritos e guarda-os; depois funcionam sem rede', async () => {
    await t.servico.atualizar(EU);
    const lista = await t.servico.listar(EU);
    expect(lista.map((i) => i.favorito.id)).toEqual(['f2', 'f1']); // mais recente primeiro
    expect(lista[0].morada?.codigo_postal).toBe('AO-HUA-MNFQPN2S-3-95');
    expect(ultimaAtualizacao(lista)).toBe('2026-09-24T08:00:00.000Z');
    // Filtro por categoria.
    expect((await t.servico.listar(EU, 'trabalho')).map((i) => i.favorito.nome)).toEqual(['Escritório']);
  });

  test('outra pessoa no mesmo telemóvel não vê os favoritos', async () => {
    await t.servico.atualizar(EU);
    expect(await t.servico.listar(OUTRO)).toEqual([]);
    expect(await t.servico.obter(OUTRO, 'f1')).toBeNull();
  });

  test('sem rede: mudar a categoria fica no telemóvel e vai para o servidor quando houver rede', async () => {
    await t.servico.atualizar(EU);
    await t.servico.alterar('f1', { nome: '  Casa  ', categoria: 'familia' });
    const item = await t.servico.obter(EU, 'f1');
    expect(item?.favorito).toMatchObject({ nome: 'Casa', categoria: 'familia', pendente: 'atualizar' });

    // Uma atualização do servidor (que ainda não sabe) não apaga a alteração local.
    t.servidor.atualizarFavorito.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    const r1 = await t.servico.atualizar(EU);
    expect(r1.erro?.message).toMatch(/Sem ligação/);
    expect((await t.servico.obter(EU, 'f1'))?.favorito.categoria).toBe('familia');

    // Com rede: envia e fica igual ao servidor.
    const r2 = await t.servico.enviarPendentes(EU);
    expect(r2).toEqual({ enviados: 1, erro: null });
    expect(t.servidor.atualizarFavorito).toHaveBeenLastCalledWith('f1', { nome: 'Casa', categoria: 'familia' });
    expect((await t.servico.obter(EU, 'f1'))?.favorito.pendente).toBeNull();
  });

  test('sem rede: tirar dos favoritos desaparece logo e é apagado no servidor quando houver rede', async () => {
    await t.servico.atualizar(EU);
    await t.servico.remover('f2');
    expect((await t.servico.listar(EU)).map((i) => i.favorito.id)).toEqual(['f1']);
    expect(await t.servico.obter(EU, 'f2')).toBeNull();

    // Tirar e depois mudar não o faz voltar.
    await t.servico.alterar('f2', { nome: 'x', categoria: 'loja' });
    expect(await t.servico.obter(EU, 'f2')).toBeNull();

    t.servidor.linhas = [linha('f1')]; // o servidor já não o tem depois de apagar
    await t.servico.atualizar(EU);
    expect(t.servidor.removerFavorito).toHaveBeenCalledWith('f2');
    expect((await t.servico.listar(EU)).map((i) => i.favorito.id)).toEqual(['f1']);
  });

  test('o que foi tirado no site deixa de aparecer na próxima atualização', async () => {
    await t.servico.atualizar(EU);
    t.servidor.linhas = [linha('f1')];
    await t.servico.atualizar(EU);
    expect((await t.servico.listar(EU)).map((i) => i.favorito.id)).toEqual(['f1']);
  });

  test('se o servidor falhar ao ler, o telemóvel fica como estava', async () => {
    await t.servico.atualizar(EU);
    t.servidor.lerFavoritos.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    await expect(t.servico.atualizar(EU)).rejects.toThrow(/Sem ligação/);
    expect(await t.servico.listar(EU)).toHaveLength(2);
  });
});

describe('Guardar como favorito (Mapa)', () => {
  const PONTO = {
    latitude: -12.7761,
    longitude: 15.7392,
    precisao: 4,
    plusCode: '5FVQ5PWV+PH5',
    codigoPostal: 'AO-HUA-MNFQPN2S-95',
    provincia: 'Huambo',
    municipio: 'Huambo',
  };

  let t: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => {
    t = await montar([linha('f1')]);
    await t.servico.atualizar(EU);
  });

  test('sem rede: aparece logo nas Moradas, por validar, à espera de rede', async () => {
    const item = await t.servico.guardarDoMapa(EU, PONTO, { visibilidade: 'LIMITED', categoria: 'trabalho', nome: '  Escritório ' });
    expect(item.favorito).toMatchObject({ id: 'id-2', morada_id: 'id-1', nome: 'Escritório', categoria: 'trabalho', pendente: 'criar' });
    const lista = await t.servico.listar(EU);
    expect(lista.map((i) => i.favorito.id)).toEqual(['id-2', 'f1']);
    expect(lista[0].morada).toMatchObject({
      id: 'id-1',
      plus_code: '5FVQ5PWV+PH5',
      codigo_postal: 'AO-HUA-MNFQPN2S-95',
      estado: 'PROPOSED',
      origem: 'local',
      precisao_m: 4,
      provincia: 'Huambo',
    });
    expect(lerDadosMorada(lista[0].morada?.dados).visibilidade).toBe('LIMITED');
    // Outra pessoa no mesmo telemóvel não o vê.
    expect(await t.servico.listar(OUTRO)).toEqual([]);
  });

  test('com rede: cria a morada e o favorito com os ids do telemóvel e fica igual ao servidor', async () => {
    await t.servico.guardarDoMapa(EU, PONTO, { visibilidade: 'PRIVATE', categoria: 'casa' });
    const r = await t.servico.enviarPendentes(EU);
    expect(r).toEqual({ enviados: 1, erro: null });
    expect(t.servidor.criarFavoritoComMorada).toHaveBeenCalledWith(EU, {
      morada: {
        id: 'id-1',
        latitude: -12.7761,
        longitude: 15.7392,
        precisao: 4,
        plusCode: '5FVQ5PWV+PH5',
        codigoPostal: 'AO-HUA-MNFQPN2S-95',
        visibilidade: 'PRIVATE',
      },
      favorito: { id: 'id-2', categoria: 'casa', nome: '' },
    });
    expect((await t.servico.obter(EU, 'id-2'))?.favorito.pendente).toBeNull();
    // Só se envia uma vez.
    await t.servico.enviarPendentes(EU);
    expect(t.servidor.criarFavoritoComMorada).toHaveBeenCalledTimes(1);
  });

  test('se o envio falhar, fica no telemóvel e não desaparece com a lista do servidor', async () => {
    await t.servico.guardarDoMapa(EU, PONTO, { visibilidade: 'PUBLIC', categoria: 'outro' });
    t.servidor.criarFavoritoComMorada.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    const r = await t.servico.atualizar(EU);
    expect(r.erro?.message).toMatch(/Sem ligação/);
    expect((await t.servico.obter(EU, 'id-2'))?.favorito.pendente).toBe('criar');
    expect((await t.servico.listar(EU)).map((i) => i.favorito.id)).toEqual(['id-2', 'f1']);
  });

  test('mudar o nome antes de enviar: continua por criar e vai com o nome novo', async () => {
    await t.servico.guardarDoMapa(EU, PONTO, { visibilidade: 'PUBLIC', categoria: 'outro' });
    await t.servico.alterar('id-2', { nome: 'Loja do Zé', categoria: 'loja' });
    expect((await t.servico.obter(EU, 'id-2'))?.favorito.pendente).toBe('criar');
    await t.servico.enviarPendentes(EU);
    expect(t.servidor.criarFavoritoComMorada.mock.calls[0][1].favorito).toEqual({ id: 'id-2', categoria: 'loja', nome: 'Loja do Zé' });
    expect(t.servidor.atualizarFavorito).not.toHaveBeenCalled();
  });

  test('tirar antes de enviar: apaga no telemóvel e não pede nada ao servidor', async () => {
    await t.servico.guardarDoMapa(EU, PONTO, { visibilidade: 'PUBLIC', categoria: 'outro' });
    await t.servico.remover('id-2');
    expect(await t.servico.obter(EU, 'id-2')).toBeNull();
    await t.servico.enviarPendentes(EU);
    expect(t.servidor.criarFavoritoComMorada).not.toHaveBeenCalled();
    expect(t.servidor.removerFavorito).not.toHaveBeenCalled();
  });
});
