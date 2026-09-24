import { atualizarFavorito, criarFavoritoComMorada, lerFavoritos, removerFavorito } from '@/api/moradas';
import { juntarAosFavoritos, lerMeusRegistos } from '@/api/registos';
import { abrirBaseDados } from '@/database/client';
import { gerarUuid } from '@/database/ids';
import { criarRepositorioFavoritos } from '@/database/repositories/favoritos';
import { criarRepositorioMoradas } from '@/database/repositories/moradas';
import { criarRepositorioPreferencias } from '@/database/repositories/preferencias';
import { obterRepositoriosSync } from '@/sync/fila';

import { criarServicoMoradas, type DependenciasMoradas } from './moradas';
import { criarServicoRegistos } from './registos';

const favoritos = () => abrirBaseDados().then((db) => criarRepositorioFavoritos(db));
const moradas = () => abrirBaseDados().then((db) => criarRepositorioMoradas(db));

/** Liga cada chamada ao repositório (a base de dados só abre quando é precisa). */
function aoAbrir<R extends object, K extends keyof R>(abrir: () => Promise<R>, nomes: K[]): Pick<R, K> {
  const r = {} as Pick<R, K>;
  for (const nome of nomes) {
    (r as Record<K, unknown>)[nome] = async (...args: unknown[]) => {
      const repo = await abrir();
      return (repo[nome] as (...a: unknown[]) => unknown)(...args);
    };
  }
  return r;
}

const deps: DependenciasMoradas = {
  favoritos: aoAbrir(favoritos, [
    'guardar',
    'listarDoUtilizador',
    'listarPendentes',
    'obter',
    'alterar',
    'marcarRemover',
    'marcarEnviado',
    'apagar',
    'substituirDoServidor',
  ]),
  moradas: aoAbrir(moradas, ['obter', 'guardarVarias']),
  servidor: { lerFavoritos, atualizarFavorito, removerFavorito, criarFavoritoComMorada },
  gerarId: gerarUuid,
};

/** Serviço das Moradas ligado à base de dados e ao Supabase (um só para a app). */
export const servicoMoradas = criarServicoMoradas(deps);

const ouvintes = new Set<() => void>();

/** Avisa os ecrãs abertos (lista e detalhe) de que as moradas mudaram. */
export const mudancasMoradas = {
  avisar(): void {
    [...ouvintes].forEach((o) => o());
  },
  ouvir(ouvinte: () => void): () => void {
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  },
};

const preferencias = () => abrirBaseDados().then((db) => criarRepositorioPreferencias(db));

/** "Os meus registos" (e juntar os aprovados aos favoritos), ligado ao telemóvel, à fila e ao Supabase. */
export const servicoRegistos = criarServicoRegistos({
  servidor: { lerMeusRegistos, juntarAosFavoritos },
  preferencias: {
    obter: async (c) => (await preferencias()).obter(c),
    guardar: async (c, v) => (await preferencias()).guardar(c, v),
  },
  fila: { porEnviar: async (userId) => (await obterRepositoriosSync()).fila.listarPorEnviarDoTipo(userId, 'field_submit') },
});
