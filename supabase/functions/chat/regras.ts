// Regras puras dos anexos do chat (testadas em src/__tests__/chat.test.ts).
// O bucket chat-media é privado: guarda-se o caminho "chat-media/<id>/<ficheiro>"
// e quem lê a conversa recebe um link temporário.

export const BUCKET_CHAT = "chat-media";
const NOME = "[A-Za-z0-9._-]{1,120}";
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** Nome do ficheiro dentro do bucket, a partir do caminho ou de um URL do Storage deste projeto; null se não for do chat. */
export function nomeNoBucketChat(valor: unknown, supabaseUrl: string): string | null {
  if (typeof valor !== "string") return null;
  let resto = valor.trim();
  const base = supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/";
  if (resto.startsWith(base)) resto = resto.slice(base.length).replace(/^(?:public|authenticated|sign)\//, "");
  else if (/^[a-z]+:/i.test(resto)) return null;
  resto = resto.split("?")[0];
  if (resto.includes("..")) return null;
  const m = resto.match(new RegExp(`^${BUCKET_CHAT}/((?:${UUID}/)?${NOME})$`));
  return m ? m[1] : null;
}

/** Ao enviar: o anexo tem de estar na pasta de quem envia ("<id>/…"). Devolve o texto a guardar. */
export function anexoParaGuardar(valor: unknown, supabaseUrl: string, quemEnvia: string): { ok: true; texto: string } | { ok: false; erro: string } {
  const nome = nomeNoBucketChat(valor, supabaseUrl);
  if (!nome || !nome.toLowerCase().startsWith(quemEnvia.toLowerCase() + "/")) {
    return { ok: false, erro: "o anexo tem de ser enviado para a tua pasta do chat" };
  }
  return { ok: true, texto: `${BUCKET_CHAT}/${nome}` };
}
