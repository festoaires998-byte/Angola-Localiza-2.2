  async mover(de, para) {
    const destino = new File(para);
    if (destino.exists) destino.delete();
    await new File(de).move(destino);
  },
  async descarregar(url, destino, progresso) {
    criarPasta(pastaDe(destino));
    await File.downloadFileAsync(url, new File(destino), {
      idempotent: true,
      onProgress: progresso ? (p) => progresso(p.bytesWritten, p.totalBytes) : undefined,
    });
  },
};

async function buscarJson(url: string): Promise<unknown> {
  const controlo = new AbortController();
  const t = setTimeout(() => controlo.abort(), 15_000);
  try {
    // Sem cache: queremos saber se há versão nova.
    const r = await fetch(url, { signal: controlo.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const urlBase = `${obterConfigSupabase().url}/storage/v1/object/public/mapas`;

/** Cria o gestor do mapa nacional correspondente ao país selecionado. */
const gestores = new Map<CodigoPais, ReturnType<typeof criarMapaOffline>>();

export function criarMapaDoPais(pais: CodigoPais) {
  const codigo = pais.trim().toUpperCase() as CodigoPais;
  const existente = gestores.get(codigo);
  if (existente) return existente;
  const entrada = mapaDoPais(codigo);
  const gestor = criarMapaOffline({ regiao: entrada.regiao, urlBase, fs: fsDaApp, buscarJson });
  gestores.set(codigo, gestor);
  return gestor;
}

/** Compatibilidade com a implementação regional antiga do Huambo. */
export const mapaHuambo = criarMapaDoPais('AO');