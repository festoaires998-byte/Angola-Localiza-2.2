import { criarLoja, type Loja } from '@/state/loja';

import { FICHEIROS_SPRITE, FONTES_MAPA, INTERVALOS_FONTES, type RegiaoMapa } from './regioes';

/**
 * Manifesto de uma região, publicado no Storage ao lado do ficheiro PMTiles
 * (mapas/{regiao}/manifesto.json). É escrito pelo workflow mapa-offline.yml.
 */
export interface ManifestoMapa {
  regiao: string;
  /** Data do build do OpenStreetMap/Protomaps (ex.: "20260923"). */
  versao: string;
  /** Nome do ficheiro dentro de mapas/{regiao}/ (ex.: "huambo-20260923.pmtiles"). */
  ficheiro: string;
  bytes: number;
  md5?: string | null;
  gerado_em?: string;
}

export type EstadoMapaOffline =
  | { estado: 'a_verificar' }
  /** Não há mapa no telemóvel. `remoto` diz o tamanho, se já se sabe. */
  | { estado: 'sem_mapa'; remoto: ManifestoMapa | null }
  | { estado: 'a_descarregar'; progresso: number; remoto: ManifestoMapa }
  | { estado: 'pronto'; local: ManifestoMapa; novo: ManifestoMapa | null }
  | { estado: 'erro'; mensagem: string; remoto: ManifestoMapa | null };

export interface SistemaFicheiros {
  /** Pasta base no telemóvel, sem "/" no fim (ex.: file:///…/files/mapas). */
  pasta: string;
  existe(uri: string): boolean;
  tamanho(uri: string): number | null;
  md5(uri: string): string | null;
  lerTexto(uri: string): Promise<string | null>;
  escreverTexto(uri: string, texto: string): Promise<void>;
  apagar(uri: string): void;
  mover(de: string, para: string): Promise<void>;
  descarregar(url: string, destino: string, progresso?: (feitos: number, total: number) => void): Promise<void>;
}

export interface DependenciasMapaOffline {
  regiao: RegiaoMapa;
  /** Base pública do bucket, sem "/" no fim: {SUPABASE_URL}/storage/v1/object/public/mapas */
  urlBase: string;
  fs: SistemaFicheiros;
  buscarJson(url: string): Promise<unknown>;
  estado?: Loja<EstadoMapaOffline>;
}

export function lerManifesto(valor: unknown): ManifestoMapa | null {
  const m = valor as Partial<ManifestoMapa> | null;
  if (!m || typeof m !== 'object') return null;
  if (typeof m.regiao !== 'string' || typeof m.versao !== 'string') return null;
  if (typeof m.ficheiro !== 'string' || !/^[\w.-]+\.pmtiles$/.test(m.ficheiro)) return null;
  if (typeof m.bytes !== 'number' || !(m.bytes > 0)) return null;
  return {
    regiao: m.regiao,
    versao: m.versao,
    ficheiro: m.ficheiro,
    bytes: m.bytes,
    md5: typeof m.md5 === 'string' ? m.md5.toLowerCase() : null,
    gerado_em: typeof m.gerado_em === 'string' ? m.gerado_em : undefined,
  };
}

/** Ficheiros de fontes e ícones (iguais para todas as regiões). */
export function recursosDoMapa(): string[] {
  const fontes = FONTES_MAPA.flatMap((f) => INTERVALOS_FONTES.map((i) => `recursos/fontes/${f}/${i}.pbf`));
  const sprite = FICHEIROS_SPRITE.map((f) => `recursos/sprite/${f}`);
  return [...fontes, ...sprite];
}

const MENSAGEM_SEM_REDE = 'Sem ligação. Liga-te à internet (de preferência Wi-Fi) para descarregar o mapa.';

/**
 * Mapa da região guardado no telemóvel:
 * - iniciar(): vê se já há mapa (sem rede);
 * - verificarRemoto(): lê o manifesto do Storage (tamanho e versão nova);
 * - descarregar(): fontes, ícones e o ficheiro PMTiles, com verificação de
 *   tamanho (e md5, se o manifesto o tiver). Só troca o mapa antigo pelo novo
 *   depois de o novo estar completo.
 */
export function criarMapaOffline(deps: DependenciasMapaOffline) {
  const { fs, regiao } = deps;
  const estado = deps.estado ?? criarLoja<EstadoMapaOffline>({ estado: 'a_verificar' });
  const pastaRegiao = `${fs.pasta}/${regiao.id}`;
  const uriManifestoLocal = `${pastaRegiao}/manifesto.json`;
  let emCurso: Promise<void> | null = null;

  const uriLocal = (m: ManifestoMapa) => `${pastaRegiao}/${m.ficheiro}`;
  const urlRemota = (m: ManifestoMapa) => `${deps.urlBase}/${regiao.id}/${m.ficheiro}`;

  function remotoAtual(): ManifestoMapa | null {
    const e = estado.obter();
    if (e.estado === 'sem_mapa' || e.estado === 'erro') return e.remoto;
    if (e.estado === 'a_descarregar') return e.remoto;
    if (e.estado === 'pronto') return e.novo;
    return null;
  }

  async function manifestoLocal(): Promise<ManifestoMapa | null> {
    try {
      const texto = await fs.lerTexto(uriManifestoLocal);
      const m = texto ? lerManifesto(JSON.parse(texto)) : null;
      if (!m) return null;
      const ficheiroCompleto = fs.existe(uriLocal(m)) && fs.tamanho(uriLocal(m)) === m.bytes;
      const recursosCompletos = recursosDoMapa().every((r) => fs.existe(`${fs.pasta}/${r}`));
      return ficheiroCompleto && recursosCompletos ? m : null;
    } catch {
      return null;
    }
  }

  async function verificarRemoto(): Promise<ManifestoMapa | null> {
    let remoto: ManifestoMapa | null;
    try {
      remoto = lerManifesto(await deps.buscarJson(`${deps.urlBase}/${regiao.id}/manifesto.json`));
    } catch {
      return null;
    }
    if (!remoto) return null;
    const r = remoto;
    estado.definir((e) => {
      if (e.estado === 'pronto') return { ...e, novo: r.versao !== e.local.versao ? r : null };
      if (e.estado === 'sem_mapa' || e.estado === 'erro') return { ...e, remoto: r };
      return e;
    });
    return r;
  }

  return {
    estado,
    /** Onde estão as fontes e os ícones (no telemóvel ou pela rede). */
    origemRecursos(local: boolean): { fontes: string; sprite: string } {
      const base = local ? fs.pasta : deps.urlBase;
      return { fontes: `${base}/recursos/fontes`, sprite: `${base}/recursos/sprite/light` };
    },
    /** "pmtiles://file:///…" do mapa guardado, ou "pmtiles://https://…" para ler pela rede. */
    urlTiles(m: ManifestoMapa, local: boolean): string {
      return `pmtiles://${local ? uriLocal(m) : urlRemota(m)}`;
    },

    async iniciar(): Promise<void> {
      const local = await manifestoLocal();
      estado.definir(local ? { estado: 'pronto', local, novo: null } : { estado: 'sem_mapa', remoto: remotoAtual() });
    },

    /** Com rede: tamanho do mapa (se ainda não há) ou versão nova (se já há). */
    verificarRemoto,

    descarregar(): Promise<void> {
      if (emCurso) return emCurso;
      emCurso = (async () => {
        const anterior = estado.obter();
        const remoto = remotoAtual() ?? (await verificarRemoto());
        if (!remoto) {
          estado.definir({ estado: 'erro', mensagem: MENSAGEM_SEM_REDE, remoto: null });
          return;
        }
        estado.definir({ estado: 'a_descarregar', progresso: 0, remoto });
        const temporario = `${pastaRegiao}/${remoto.ficheiro}.parcial`;
        try {
          for (const r of recursosDoMapa()) {
            const destino = `${fs.pasta}/${r}`;
            if (!fs.existe(destino)) await fs.descarregar(`${deps.urlBase}/${r}`, destino);
          }
          if (fs.existe(temporario)) fs.apagar(temporario);
          await fs.descarregar(urlRemota(remoto), temporario, (feitos, total) => {
            const t = total > 0 ? total : remoto.bytes;
            estado.definir({ estado: 'a_descarregar', progresso: Math.min(1, feitos / t), remoto });
          });
          if (fs.tamanho(temporario) !== remoto.bytes) {
            throw new Error('O ficheiro do mapa chegou incompleto. Tenta outra vez.');
          }
          if (remoto.md5 && fs.md5(temporario)?.toLowerCase() !== remoto.md5) {
            throw new Error('O ficheiro do mapa chegou danificado. Tenta outra vez.');
          }
          await fs.mover(temporario, uriLocal(remoto));
          await fs.escreverTexto(uriManifestoLocal, JSON.stringify(remoto));
          // O mapa antigo só é apagado depois de o novo estar no sítio.
          if (anterior.estado === 'pronto' && anterior.local.ficheiro !== remoto.ficheiro) {
            try {
              fs.apagar(uriLocal(anterior.local));
            } catch {
              // Fica ocupado espaço; não impede nada.
            }
          }
          estado.definir({ estado: 'pronto', local: remoto, novo: null });
        } catch (e) {
          try {
            if (fs.existe(temporario)) fs.apagar(temporario);
          } catch {
            // ignora
          }
          const mensagem = e instanceof Error && e.message.startsWith('O ficheiro') ? e.message : MENSAGEM_SEM_REDE;
          // Se já havia um mapa, continua a usá-lo.
          estado.definir(
            anterior.estado === 'pronto'
              ? { ...anterior, novo: remoto }
              : { estado: 'erro', mensagem, remoto },
          );
          if (anterior.estado === 'pronto') throw new Error(mensagem);
        } finally {
          emCurso = null;
        }
      })();
      return emCurso;
    },
  };
}

export type MapaOffline = ReturnType<typeof criarMapaOffline>;
