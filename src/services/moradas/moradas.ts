import { lerDadosMorada, type DadosMorada, type FavoritoDoServidor } from '@/api/moradasNucleo';
import type { CategoriaFavorito, Favorito, RepositorioFavoritos } from '@/database/repositories/favoritos';
import type { Morada, RepositorioMoradas } from '@/database/repositories/moradas';
import type { TipoOperacao } from '@/database/repositories/filaSaida';

/**
 * Separador Moradas: os favoritos do utilizador, guardados no telemóvel para
 * funcionarem sem rede.
 * - A lista vem sempre do telemóvel (abre logo, com ou sem rede).
 * - Com rede: primeiro envia as alterações feitas sem rede, depois traz a
 *   lista do servidor e troca a do telemóvel.
 * - Mudar o nome/categoria ou tirar dos favoritos funciona sem rede: fica
 *   marcado no telemóvel e vai para o servidor quando houver rede.
 * - "Guardar como favorito" (Mapa) também funciona sem rede: a morada (por
 *   validar) e o favorito ficam no telemóvel ('criar') e são criados no
 *   servidor quando houver rede, com os ids gerados aqui (sem duplicar).
 */

/** Quem pode ver a morada (addresses.visibility_level), como no site. */
export const VISIBILIDADES = ['PUBLIC', 'LIMITED', 'PRIVATE'] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];

/** O ponto do Mapa a guardar como favorito. */
export interface PontoDoMapa {
  latitude: number;
  longitude: number;
  precisao: number | null;
  plusCode: string;
  /** Só o confirmado pelo servidor (o provisório pode não ser o final). */
  codigoPostal: string | null;
  provincia: string | null;
  municipio: string | null;
}

/** O que vai para o servidor ao criar a morada e o favorito. */
export interface NovoFavoritoComMorada {
  morada: {
    id: string;
    latitude: number;
    longitude: number;
    precisao: number | null;
    plusCode: string | null;
    codigoPostal: string | null;
    visibilidade: Visibilidade;
  };
  favorito: { id: string; categoria: CategoriaFavorito; nome: string };
}

function eVisibilidade(v: unknown): v is Visibilidade {
  return typeof v === 'string' && (VISIBILIDADES as readonly string[]).includes(v);
}
export interface ItemMorada {
  favorito: Favorito;
  /** null se a morada ainda não está no telemóvel (não devia acontecer). */
  morada: Morada | null;
}

export interface DependenciasMoradas {
  favoritos: Pick<
    RepositorioFavoritos,
    | 'guardar'
    | 'listarDoUtilizador'
    | 'listarPendentes'
    | 'obter'
    | 'alterar'
    | 'marcarRemover'
    | 'marcarEnviado'
    | 'apagar'
    | 'substituirDoServidor'
  >;
  moradas: Pick<RepositorioMoradas, 'obter' | 'guardarVarias'>;
  servidor: {
    lerFavoritos(): Promise<FavoritoDoServidor[]>;
    atualizarFavorito(id: string, mudancas: { nome: string; categoria: CategoriaFavorito }): Promise<void>;
    removerFavorito(id: string): Promise<void>;
    /** Cria a morada (por validar) e o favorito; se já existirem (envio repetido), não é erro. */
    criarFavoritoComMorada(userId: string, novo: NovoFavoritoComMorada): Promise<void>;
  };
  gerarId: () => string;
  agora?: () => Date;
  /** Fila unificada opcional; injetada pela composição da app. */
  acrescentarOperacao?: (userId: string, tipo: TipoOperacao, payload: unknown) => Promise<unknown>;
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
        } else if (f.pendente === 'criar') {
          const m = await deps.moradas.obter(f.morada_id);
          if (!m) {
            // Sem a morada não há o que criar (não devia acontecer).
            await deps.favoritos.apagar(f.id);
            continue;
          }
          const visibilidade = lerDadosMorada(m.dados).visibilidade;
          await deps.servidor.criarFavoritoComMorada(userId, {
            morada: {
              id: m.id,
              latitude: m.latitude,
              longitude: m.longitude,
              precisao: m.precisao_m,
              plusCode: m.plus_code,
              codigoPostal: m.codigo_postal,
              visibilidade: eVisibilidade(visibilidade) ? visibilidade : 'PUBLIC',
            },
            favorito: { id: f.id, categoria: f.categoria, nome: f.nome },
          });
          await deps.favoritos.marcarEnviado(f.id);
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
     * "Guardar como favorito" no Mapa: guarda no telemóvel a morada (por
     * validar) e o favorito, para enviar quando houver rede (enviarPendentes).
     */
    async guardarDoMapa(
      userId: string,
      ponto: PontoDoMapa,
      escolhas: { visibilidade: Visibilidade; categoria: CategoriaFavorito; nome?: string },
    ): Promise<ItemMorada> {
      const agora = (deps.agora?.() ?? new Date()).toISOString();
      const dados: DadosMorada = { referencia: null, numero_porta: null, visibilidade: escolhas.visibilidade, criada_em: agora };
      const morada: Morada = {
        id: deps.gerarId(),
        plus_code: ponto.plusCode,
        codigo_postal: ponto.codigoPostal,
        latitude: ponto.latitude,
        longitude: ponto.longitude,
        precisao_m: ponto.precisao,
        provincia: ponto.provincia,
        municipio: ponto.municipio,
        estado: 'PROPOSED',
        origem: 'local',
        dados,
        atualizado_em: agora,
      };
      const favorito: Favorito = {
        id: deps.gerarId(),
        user_id: userId,
        morada_id: morada.id,
        nome: (escolhas.nome ?? '').trim(),
        categoria: escolhas.categoria,
        pendente: deps.acrescentarOperacao ? null : 'criar',
        criado_em: agora,
        atualizado_em: agora,
      };
      await deps.moradas.guardarVarias([morada]);
      await deps.favoritos.guardar(favorito);
      await deps.acrescentarOperacao?.(userId, 'create_favorite', {
        address_id: morada.id,
        address: {
          latitude: morada.latitude,
          longitude: morada.longitude,
          plus_code: morada.plus_code,
          postal_code: morada.codigo_postal,
          accuracy_meters: morada.precisao_m,
          visibility_level: escolhas.visibilidade,
          country_code: 'AO',
        },
        category: favorito.categoria,
        label: favorito.nome.trim() || null,
      });
      return { favorito, morada };
    },

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
      await deps.favoritos.alterar(id, { nome: mudancas.nome.trim(), categoria: mudancas.categoria, ...(deps.acrescentarOperacao ? { pendente: null } : {}) });
    },

    async remover(id: string): Promise<void> {
      if (deps.acrescentarOperacao) {
        await deps.favoritos.apagar(id);
      } else {
        await deps.favoritos.marcarRemover(id);
      }
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
