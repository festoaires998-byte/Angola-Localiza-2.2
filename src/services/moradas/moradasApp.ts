import { atualizarFavorito, lerFavoritos, removerFavorito } from '@/api/moradas';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioFavoritos } from '@/database/repositories/favoritos';
import { criarRepositorioMoradas } from '@/database/repositories/moradas';

import { criarServicoMoradas, type DependenciasMoradas } from './moradas';

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
  servidor: { lerFavoritos, atualizarFavorito, removerFavorito },
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
