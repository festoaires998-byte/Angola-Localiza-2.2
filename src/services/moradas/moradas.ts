import type { FavoritoDoServidor } from '@/api/moradasNucleo';
import type { CategoriaFavorito, Favorito, RepositorioFavoritos } from '@/database/repositories/favoritos';
import type { Morada, RepositorioMoradas } from '@/database/repositories/moradas';

/**
 * Separador Moradas: os favoritos do utilizador, guardados no telemóvel para
 * funcionarem sem rede.
 * - A lista vem sempre do telemóvel (abre logo, com ou sem rede).
 * - Com rede: primeiro envia as alterações feitas sem rede, depois traz a
 *   lista do servidor e troca a do telemóvel.
 * - Mudar o nome/categoria ou tirar dos favoritos funciona sem rede: fica
 *   marcado no telemóvel e vai para o servidor quando houver rede.
 */
export interface ItemMorada {
  favorito: Favorito;
  /** null se a morada ainda não está no telemóvel (não devia acontecer). */
  morada: Morada | null;
}

export interface DependenciasMoradas {
  favoritos: Pick<
    RepositorioFavoritos,
    'listarDoUtilizador' | 'listarPendentes' | 'obter' | 'alterar' | 'marcarRemover' | 'marcarEnviado' | 'apagar' | 'substituirDoServidor'
  >;
  moradas: Pick<RepositorioMoradas, 'obter' | 'guardarVarias'>;
  servidor: {
    lerFavoritos(): Promise<FavoritoDoServidor[]>;
    atualizarFavorito(id: string, mudancas: { nome: string; categoria: CategoriaFavorito }): Promise<void>;
    removerFavorito(id: string): Promise<void>;
  };
}

export interface ResultadoEnvio {
  enviados: number;
  /** Primeiro erro (ex.: sem rede); os que falharam ficam para a próxima. */
  erro: Error | null;
}

export function criarServicoMoradas(deps: DependenciasMoradas) {
  async function juntar(favorito: Favorito): Promise<ItemMorada> {
    return { favorito, morada: await deps.moradas.obter(favorito.morada_id) };
  }

  async function enviarPendentes(userId: string): Promise<ResultadoEnvio> {
    let enviados = 0;
    let erro: Error | null = null;
    for (const f of await deps.favoritos.listarPendentes(userId)) {
      try {
        if (f.pendente === 'remover') {
          await deps.servidor.removerFavorito(f.id);
          await deps.favoritos.apagar(f.id);
        } else {
          await deps.servidor.atualizarFavorito(f.id, { nome: f.nome, categoria: f.categoria });
          await deps.favoritos.marcarEnviado(f.id);
        }
        enviados++;
      } catch (e) {
        erro ??= e instanceof Error ? e : new Error(String(e));
      }
    }
    return { enviados, erro };
  }

  return {
    /** Só o que está no telemóvel. */
    async listar(userId: string, categoria?: CategoriaFavorito): Promise<ItemMorada[]> {
      const favoritos = await deps.favoritos.listarDoUtilizador(userId, categoria);
      return Promise.all(favoritos.map(juntar));
    },

    /** Um favorito do utilizador (null se não existe ou foi tirado). */
    async obter(userId: string, id: string): Promise<ItemMorada | null> {
      const f = await deps.favoritos.obter(id);
      if (!f || f.user_id !== userId || f.pendente === 'remover') return null;
      return juntar(f);
    },

    enviarPendentes,

    /**
     * Com rede: envia o que está pendente e traz a lista do servidor.
     * Se o servidor falhar, o telemóvel fica como estava (e o erro sobe).
     */
    async atualizar(userId: string): Promise<ResultadoEnvio> {
      const envio = await enviarPendentes(userId);
      const doServidor = await deps.servidor.lerFavoritos();
      await deps.moradas.guardarVarias(doServidor.map((d) => d.morada));
      await deps.favoritos.substituirDoServidor(
        userId,
        doServidor.map((d) => ({ ...d.favorito, user_id: userId })),
      );
      return envio;
    },

    async alterar(id: string, mudancas: { nome: string; categoria: CategoriaFavorito }): Promise<void> {
      await deps.favoritos.alterar(id, { nome: mudancas.nome.trim(), categoria: mudancas.categoria });
    },

    async remover(id: string): Promise<void> {
      await deps.favoritos.marcarRemover(id);
    },
  };
}

export type ServicoMoradas = ReturnType<typeof criarServicoMoradas>;

/** Quando a lista foi trazida do servidor pela última vez (o favorito mais recente sem alterações locais). */
export function ultimaAtualizacao(itens: ItemMorada[]): string | null {
  const datas = itens.filter((i) => i.favorito.pendente === null).map((i) => i.favorito.atualizado_em);
  return datas.length ? datas.sort().at(-1)! : null;
}

/** O que aparece em grande: o nome dado pela pessoa, ou o código. */
export function tituloMorada(item: ItemMorada): string {
  return item.favorito.nome || item.morada?.codigo_postal || item.morada?.plus_code || 'Morada sem código';
}
