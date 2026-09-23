import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { criarMapaOffline, lerManifesto, recursosDoMapa, type ManifestoMapa, type SistemaFicheiros } from '../nucleoMapaOffline';
import { REGIAO_HUAMBO } from '../regioes';

const BASE = 'https://teste.supabase.co/storage/v1/object/public/mapas';
const PASTA = 'file:///dados/mapas';

const M1: ManifestoMapa = { regiao: 'huambo', versao: '20260901', ficheiro: 'huambo-20260901.pmtiles', bytes: 1000, md5: 'aaa' };
const M2: ManifestoMapa = { regiao: 'huambo', versao: '20261001', ficheiro: 'huambo-20261001.pmtiles', bytes: 1200, md5: 'bbb' };

/** Sistema de ficheiros em memória. `servidor` diz o que cada URL devolve. */
function montar(servidor: Record<string, { bytes: number; md5?: string } | 'falha'>, manifestoRemoto: ManifestoMapa | 'falha') {
  const ficheiros = new Map<string, { bytes: number; md5: string | null; texto?: string }>();
  const descarregar = jest.fn(async (url: string, destino: string, progresso?: (f: number, t: number) => void) => {
    const r = servidor[url] ?? { bytes: 10 };
    if (r === 'falha') throw new Error('Network request failed');
    progresso?.(r.bytes / 2, r.bytes);
    progresso?.(r.bytes, r.bytes);
    ficheiros.set(destino, { bytes: r.bytes, md5: r.md5 ?? null });
  });
  const fs: SistemaFicheiros = {
    pasta: PASTA,
    existe: (u) => ficheiros.has(u),
    tamanho: (u) => ficheiros.get(u)?.bytes ?? null,
    md5: (u) => ficheiros.get(u)?.md5 ?? null,
    lerTexto: async (u) => ficheiros.get(u)?.texto ?? null,
    escreverTexto: async (u, texto) => {
      ficheiros.set(u, { bytes: texto.length, md5: null, texto });
    },
    apagar: (u) => {
      ficheiros.delete(u);
    },
    mover: async (de, para) => {
      ficheiros.set(para, ficheiros.get(de)!);
      ficheiros.delete(de);
    },
    descarregar,
  };
  const buscarJson = jest.fn(async (_url: string) => {
    if (manifestoRemoto === 'falha') throw new Error('Network request failed');
    return manifestoRemoto as unknown;
  });
  const mapa = criarMapaOffline({ regiao: REGIAO_HUAMBO, urlBase: BASE, fs, buscarJson });
  return { mapa, ficheiros, descarregar, buscarJson };
}

describe('mapa offline do Huambo', () => {
  let t: ReturnType<typeof montar>;
  beforeEach(() => {
    t = montar({ [`${BASE}/huambo/${M1.ficheiro}`]: { bytes: 1000, md5: 'aaa' }, [`${BASE}/huambo/${M2.ficheiro}`]: { bytes: 1200, md5: 'bbb' } }, M1);
  });

  test('sem mapa no telemóvel: estado sem_mapa (sem precisar de rede)', async () => {
    await t.mapa.iniciar();
    expect(t.mapa.estado.obter()).toEqual({ estado: 'sem_mapa', remoto: null });
    expect(t.buscarJson).not.toHaveBeenCalled();
  });

  test('com rede sabe o tamanho antes de descarregar', async () => {
    await t.mapa.iniciar();
    await t.mapa.verificarRemoto();
    expect(t.mapa.estado.obter()).toEqual({ estado: 'sem_mapa', remoto: M1 });
  });

  test('descarrega fontes, ícones e o mapa; depois abre sem rede', async () => {
    await t.mapa.iniciar();
    await t.mapa.descarregar();
    expect(t.mapa.estado.obter()).toEqual({ estado: 'pronto', local: M1, novo: null });
    expect(t.descarregar).toHaveBeenCalledTimes(recursosDoMapa().length + 1);
    expect(t.ficheiros.has(`${PASTA}/huambo/${M1.ficheiro}`)).toBe(true);
    expect(t.ficheiros.has(`${PASTA}/huambo/${M1.ficheiro}.parcial`)).toBe(false);
    expect(t.mapa.urlTiles(M1, true)).toBe(`pmtiles://${PASTA}/huambo/${M1.ficheiro}`);

  });

  test('reabrir sem rede encontra o mapa guardado', async () => {
    await t.mapa.descarregar();
    await t.mapa.iniciar();
    expect(t.mapa.estado.obter()).toMatchObject({ estado: 'pronto', local: M1 });
  });

  test('ficheiro incompleto: não fica guardado e diz para tentar outra vez', async () => {
    t = montar({ [`${BASE}/huambo/${M1.ficheiro}`]: { bytes: 400, md5: 'aaa' } }, M1);
    await t.mapa.descarregar();
    expect(t.mapa.estado.obter()).toMatchObject({ estado: 'erro', mensagem: 'O ficheiro do mapa chegou incompleto. Tenta outra vez.' });
    expect(t.ficheiros.has(`${PASTA}/huambo/${M1.ficheiro}`)).toBe(false);
    expect(t.ficheiros.has(`${PASTA}/huambo/${M1.ficheiro}.parcial`)).toBe(false);
  });

  test('ficheiro danificado (md5 diferente): não fica guardado', async () => {
    t = montar({ [`${BASE}/huambo/${M1.ficheiro}`]: { bytes: 1000, md5: 'zzz' } }, M1);
    await t.mapa.descarregar();
    expect(t.mapa.estado.obter()).toMatchObject({ estado: 'erro', mensagem: 'O ficheiro do mapa chegou danificado. Tenta outra vez.' });
  });

  test('sem rede: mensagem clara', async () => {
    t = montar({}, 'falha');
    await t.mapa.iniciar();
    await t.mapa.descarregar();
    expect(t.mapa.estado.obter()).toMatchObject({ estado: 'erro', mensagem: expect.stringContaining('Liga-te à internet') });
  });

  test('versão nova: avisa, e só apaga a antiga depois de a nova estar completa', async () => {
    await t.mapa.descarregar();
    t.buscarJson.mockResolvedValue(M2 as unknown);
    await t.mapa.verificarRemoto();
    expect(t.mapa.estado.obter()).toEqual({ estado: 'pronto', local: M1, novo: M2 });
    await t.mapa.descarregar();
    expect(t.mapa.estado.obter()).toEqual({ estado: 'pronto', local: M2, novo: null });
    expect(t.ficheiros.has(`${PASTA}/huambo/${M1.ficheiro}`)).toBe(false);
    expect(t.ficheiros.has(`${PASTA}/huambo/${M2.ficheiro}`)).toBe(true);
  });

  test('se a atualização falhar, continua com o mapa antigo', async () => {
    await t.mapa.descarregar();
    t.buscarJson.mockResolvedValue(M2 as unknown);
    await t.mapa.verificarRemoto();
    t.descarregar.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(t.mapa.descarregar()).rejects.toThrow();
    expect(t.mapa.estado.obter()).toEqual({ estado: 'pronto', local: M1, novo: M2 });
    expect(t.ficheiros.has(`${PASTA}/huambo/${M1.ficheiro}`)).toBe(true);
  });

  test('manifesto inválido é ignorado', () => {
    expect(lerManifesto({ regiao: 'huambo', versao: '1', ficheiro: '../x.pmtiles', bytes: 1 })).toBeNull();
    expect(lerManifesto({ regiao: 'huambo', versao: '1', ficheiro: 'x.pmtiles', bytes: 0 })).toBeNull();
    expect(lerManifesto(null)).toBeNull();
  });
});
