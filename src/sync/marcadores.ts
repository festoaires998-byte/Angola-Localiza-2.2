import { idDoMarcador, type FicheiroPendente } from '@/database/repositories/ficheirosPendentes';

/**
 * Campos do payload onde pode aparecer um marcador "offline:<id>"
 * (os mesmos que o site usa).
 */
const CAMPOS_RAIZ = ['photo_facade_url', 'photo_qr_url'] as const;
const CAMPOS_PROVA = ['photo_url', 'signature_url'] as const;

type Objeto = Record<string, unknown>;

function eObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Ids dos ficheiros referidos pelos marcadores do payload (sem repetidos, pela ordem). */
export function idsDosMarcadores(payload: unknown): string[] {
  const ids: string[] = [];
  const juntar = (valor: unknown) => {
    const id = idDoMarcador(valor);
    if (id && !ids.includes(id)) ids.push(id);
  };
  if (!eObjeto(payload)) return ids;
  CAMPOS_RAIZ.forEach((c) => juntar(payload[c]));
  if (eObjeto(payload.proof)) {
    const prova = payload.proof;
    CAMPOS_PROVA.forEach((c) => juntar(prova[c]));
  }
  return ids;
}

/**
 * Devolve uma cópia do payload com cada marcador cujo id está em `urls`
 * trocado pelo URL real. Os outros marcadores ficam como estão.
 */
export function trocarMarcadores(payload: unknown, urls: ReadonlyMap<string, string>): unknown {
  if (!eObjeto(payload)) return payload;
  const trocar = (valor: unknown) => {
    const id = idDoMarcador(valor);
    return id && urls.has(id) ? urls.get(id) : valor;
  };
  const novo: Objeto = { ...payload };
  CAMPOS_RAIZ.forEach((c) => {
    if (c in novo) novo[c] = trocar(novo[c]);
  });
  if (eObjeto(payload.proof)) {
    const prova: Objeto = { ...payload.proof };
    CAMPOS_PROVA.forEach((c) => {
      if (c in prova) prova[c] = trocar(prova[c]);
    });
    novo.proof = prova;
  }
  return novo;
}

/** Nome do ficheiro no Storage: "offline-<id>.jpg", ou ".png" se for image/png. */
export function nomeNoStorage(ficheiro: Pick<FicheiroPendente, 'id' | 'content_type'>): string {
  const extensao = ficheiro.content_type.toLowerCase() === 'image/png' ? 'png' : 'jpg';
  return `offline-${ficheiro.id}.${extensao}`;
}

/** SUPABASE_URL/storage/v1/object/public/<bucket>/<nome> */
export function urlPublico(urlSupabase: string, bucket: string, nome: string): string {
  return `${urlSupabase}/storage/v1/object/public/${bucket}/${nome}`;
}
