// Angola Localiza - Geocode: partes puras (sem Deno), testadas pela app.
// A chave da LocationIQ vem SEMPRE do segredo LOCATIONIQ_KEY do Supabase
// (Edge Functions > Secrets) e nunca é escrita em respostas nem em registos.

export const NOME_SEGREDO = "LOCATIONIQ_KEY";
export const BASE_LOCATIONIQ = "https://us1.locationiq.com/v1";

/** Mensagem quando o segredo não existe (não diz nada sobre a chave). */
export const ERRO_SEM_CHAVE =
  "Geocodificação indisponível: falta configurar o segredo LOCATIONIQ_KEY no servidor.";

/** A chave do segredo, ou null se não existir / estiver vazia. */
export function lerChave(obter: (nome: string) => string | undefined): string | null {
  const valor = obter(NOME_SEGREDO)?.trim();
  return valor ? valor : null;
}

/** Troca a chave (e o parâmetro key=...) por *** em qualquer texto que vá sair da função. */
export function esconderChave(texto: string, chave: string | null): string {
  let t = texto.replace(/([?&]key=)[^&\s"']+/gi, "$1***");
  if (chave) t = t.split(chave).join("***");
  return t;
}

export function urlReverse(chave: string, latitude: number, longitude: number): string {
  const p = new URLSearchParams({ key: chave, lat: String(latitude), lon: String(longitude), format: "json", addressdetails: "1" });
  return `${BASE_LOCATIONIQ}/reverse?${p}`;
}

/** "lng,lat;lng,lat;..." com 2 a 25 pontos (o que a LocationIQ aceita no optimize). */
const COORDENADAS = /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?(;-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?){1,24}$/;

export function coordenadasValidas(coords: unknown): coords is string {
  return typeof coords === "string" && COORDENADAS.test(coords);
}

export function urlOptimize(chave: string, coords: string): string {
  const p = new URLSearchParams({ key: chave, roundtrip: "false", source: "first" });
  return `${BASE_LOCATIONIQ}/optimize/driving/${coords}?${p}`;
}
