import { describe, expect, jest, test } from '@jest/globals';

import type { ResultadoPesquisa } from '@/domain/enderecamento/pesquisa';
import type { ItemMorada } from '@/services/moradas/moradas';

import { resolverDestino, type DependenciasDestino } from './destino';

function guardada(id: string, latitude: number, longitude: number, origem: 'servidor' | 'local' = 'servidor', pendente: 'remover' | null = null): ItemMorada {
  return {
    favorito: { id: `f-${id}`, user_id: 'eu', morada_id: id, nome: '', categoria: 'casa', pendente, criado_em: null, atualizado_em: 'x' },
    morada: {
      id, plus_code: null, codigo_postal: null, latitude, longitude, precisao_m: 4,
      provincia: null, municipio: null, estado: 'APPROVED', origem, dados: null, atualizado_em: 'x',
    },
  } as ItemMorada;
}

const resultado = (id: string, codigoPostal: string | null, tipo: ResultadoPesquisa['tipo'] = 'morada'): ResultadoPesquisa => ({
  tipo, id, titulo: codigoPostal ?? id, subtitulo: null, latitude: -12.7, longitude: 15.7, codigoPostal, plusCode: null,
});

function deps(extra: Partial<DependenciasDestino> = {}) {
  const criarMorada = jest.fn(async (_p: { latitude: number; longitude: number }) => 'nova-1');
  const pesquisar = jest.fn(async (_q: string): Promise<ResultadoPesquisa[]> => []);
  return { guardadas: [], online: true, criarMorada, pesquisar, ...extra } as DependenciasDestino & {
    criarMorada: typeof criarMorada;
    pesquisar: typeof pesquisar;
  };
}

const ponto = (latitude: number, longitude: number) => ({ tipo: 'ponto' as const, latitude, longitude, origem: 'plus_code' as const });

describe('resolverDestino: Plus Code, coordenadas ou link do mapa', () => {
  test('o mesmo sítio de uma morada guardada (até ~15 m) usa essa morada', async () => {
    const d = deps({ guardadas: [guardada('m1', -12.7761, 15.7392)] });
    expect(await resolverDestino(ponto(-12.77619, 15.73929), d)).toEqual({ tipo: 'existente', moradaId: 'm1' });
    expect(d.criarMorada).not.toHaveBeenCalled();
  });

  test('uma morada guardada só no telemóvel (ainda por enviar) conta como nova', async () => {
    const d = deps({ guardadas: [guardada('m1', -12.7761, 15.7392, 'local')] });
    expect(await resolverDestino(ponto(-12.7761, 15.7392), d)).toEqual({ tipo: 'nova', moradaId: 'm1' });
  });

  test('um sítio sem morada guardada cria uma morada nova (também sem rede)', async () => {
    const d = deps({ online: false, guardadas: [guardada('m1', -12.7761, 15.7392), guardada('m2', -12.78, 15.74, 'servidor', 'remover')] });
    expect(await resolverDestino(ponto(-12.78, 15.74), d)).toEqual({ tipo: 'nova', moradaId: 'nova-1' });
    expect(d.criarMorada).toHaveBeenCalledWith({ latitude: -12.78, longitude: 15.74 });
  });

  test('se não conseguir guardar no telemóvel, explica', async () => {
    const d = deps({ criarMorada: jest.fn(async () => { throw new Error('disco cheio'); }) as DependenciasDestino['criarMorada'] });
    expect(await resolverDestino(ponto(-12.78, 15.74), d)).toEqual({
      tipo: 'erro',
      mensagem: 'Não foi possível guardar o destino neste telemóvel (disco cheio).',
    });
  });
});

describe('resolverDestino: código postal', () => {
  test('encontra a morada com o código exato (sem ligar a espaços e maiúsculas)', async () => {
    const d = deps();
    d.pesquisar.mockResolvedValue([resultado('rua-1', null, 'rua'), resultado('m-outra', 'AO-HUA-11111111-1'), resultado('m-certa', 'AO-HUA-23456789-42')]);
    expect(await resolverDestino({ tipo: 'servidor', query: 'ao-hua-23456789-42 ' }, d)).toEqual({ tipo: 'existente', moradaId: 'm-certa' });
    expect(d.criarMorada).not.toHaveBeenCalled();
  });

  test('sem resultado exato: explica (não escolhe "o mais parecido")', async () => {
    const d = deps();
    d.pesquisar.mockResolvedValue([resultado('m-outra', 'AO-HUA-11111111-1')]);
    expect((await resolverDestino({ tipo: 'servidor', query: 'AO-HUA-23456789-42' }, d)).tipo).toBe('erro');
  });

  test('sem rede não pesquisa e explica as alternativas', async () => {
    const d = deps({ online: false });
    const r = await resolverDestino({ tipo: 'servidor', query: 'AO-HUA-23456789-42' }, d);
    expect(r).toMatchObject({ tipo: 'erro', mensagem: expect.stringContaining('precisas de rede') });
    expect(d.pesquisar).not.toHaveBeenCalled();
  });

  test('erro do servidor aparece na mensagem', async () => {
    const d = deps();
    d.pesquisar.mockRejectedValue(new Error('Erro 500'));
    expect(await resolverDestino({ tipo: 'servidor', query: 'AO-HUA-23456789-42' }, d)).toEqual({
      tipo: 'erro',
      mensagem: 'Não foi possível procurar o código (Erro 500).',
    });
  });
});

describe('resolverDestino: entradas que não servem', () => {
  test('texto inválido e link sem localização', async () => {
    expect(await resolverDestino({ tipo: 'invalida', motivo: 'Escreve mais.' }, deps())).toEqual({ tipo: 'erro', mensagem: 'Escreve mais.' });
    expect((await resolverDestino({ tipo: 'link', url: 'https://exemplo.ao' }, deps())).tipo).toBe('erro');
  });
});
