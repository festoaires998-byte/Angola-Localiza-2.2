// Fotos do Campo e do registo de moradas (testadas em src/__tests__/fotosCampo.test.ts).
// O bucket field-photos é privado: cada pessoa envia para a sua pasta
// (field-photos/<id>/…) e quem valida recebe links temporários.

export const BUCKET_FOTOS = "field-photos";

/** Nome no bucket, a partir do caminho ("field-photos/<id>/x.jpg") ou de um URL do Storage deste projeto. */
export function nomeNoBucketFotos(valor: unknown, supabaseUrl: string): string | null {
  if (typeof valor !== "string") return null;
  let resto = valor.trim().split("?")[0];
  const base = supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/";
  if (resto.startsWith(base)) resto = resto.slice(base.length).replace(/^(?:public|authenticated|sign)\//, "");
  else if (/^[a-z]+:/i.test(resto)) return null;
  if (resto.includes("..")) return null;
  const m = resto.match(/^field-photos\/([A-Za-z0-9._\/-]{1,250})$/);
  return m ? m[1] : null;
}

/** Ao submeter: a foto tem de estar na pasta de quem submete. Devolve o texto a guardar. */
export function fotoParaGuardar(valor: unknown, supabaseUrl: string, quemEnvia: string): string | null {
  const nome = nomeNoBucketFotos(valor, supabaseUrl);
  if (!nome || nome.slice(0, quemEnvia.length + 1).toLowerCase() !== quemEnvia.toLowerCase() + "/") return null;
  return `${BUCKET_FOTOS}/${nome}`;
}
