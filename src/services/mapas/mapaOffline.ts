import { Directory, File, Paths } from 'expo-file-system';

import { obterConfigSupabase } from '@/config/env';
import { criarMapaOffline, type SistemaFicheiros } from './nucleoMapaOffline';
import { mapaDoPais } from './catalogoMapas';
import type { CodigoPais } from '@/config/pais';

export type { EstadoMapaOffline, ManifestoMapa } from './nucleoMapaOffline';

function pastaDe(uri: string): string { return uri.slice(0, uri.lastIndexOf('/')); }
function criarPasta(uri: string): void { new Directory(uri).create({ intermediates: true, idempotent: true }); }

const fsDaApp: SistemaFicheiros = {
  pasta: `${Paths.document.uri.replace(/\/+$/, '')}/mapas`,
  existe: (uri) => new File(uri).exists,
  tamanho(uri) { const f = new File(uri); return f.exists ? f.size : null; },
  md5(uri) { const f = new File(uri); return f.exists ? f.md5 : null; },
  async lerTexto(uri) { const f = new File(uri); return f.exists ? f.text() : null; },
  async escreverTexto(uri, texto) { criarPasta(pastaDe(uri)); const f = new File(uri); if (!f.exists) f.create(); f.write(texto); },
  apagar(uri) { const f = new File(uri); if (f.exists) f.delete(); },
  async mover(de, para) { const destino = new File(para); if (destino.exists) destino.delete(); await new File(de).move(destino); },
  async descarregar(url, destino, progresso) { criarPasta(pastaDe(destino)); await File.downloadFileAsync(url, new File(destino), { idempotent: true, onProgress: progresso ? (p) => progresso(p.bytesWritten, p.totalBytes) : undefined }); },
};

async function buscarJson(url: string): Promise<unknown> {
  const controlo = new AbortController(); const t = setTimeout(() => controlo.abort(), 15_000);
  try { const r = await fetch(url, { signal: controlo.signal, headers: { 'Cache-Control': 'no-cache' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}

const urlBase = `${obterConfigSupabase().url}/storage/v1/object/public/mapas`;
const gestores = new Map<CodigoPais, ReturnType<typeof criarMapaOffline>>();

export function criarMapaDoPais(pais: CodigoPais) {
  const codigo = pais.trim().toUpperCase() as CodigoPais;
  const existente = gestores.get(codigo); if (existente) return existente;
  const entrada = mapaDoPais(codigo);
  const gestor = criarMapaOffline({ regiao: entrada.regiao, urlBase, fs: fsDaApp, buscarJson });
  gestores.set(codigo, gestor); return gestor;
}

export const mapaHuambo = criarMapaDoPais('AO');
