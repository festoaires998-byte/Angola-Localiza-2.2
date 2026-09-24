import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  CAMPOS_MORADA, ESTADOS_PUBLICOS, MAX_RESULTADOS, cartaoPublico, interpretar, interpretarCodigo, juntarResultados,
  padraoContem, podeVer, podeVerPublico, resultadoLugar, resultadoMorada, type MoradaLida, type Resultado,
} from "./regras.ts";

// Angola Localiza - Pesquisa (v2)
// A pesquisa única da app e do site: código postal, Plus Code, "Rua X, 12",
// ruas, bairros e referências de moradas.
// - Pesquisa: só com sessão iniciada. Só moradas aprovadas/oficiais/publicadas;
//   as "Privadas" só para quem as criou.
// - action=cartao (o link público "?endereco=" do site, sem sessão): só pelo
//   código postal ou Plus Code completos, só moradas aprovadas que não são
//   "Privadas", sem coordenadas.
// - Não devolve contactos nem quem criou a morada, e não guarda o que se pesquisou.
// - v2: ruas, bairros e referências sem ligar a acentos ("missao" = "Missão"),
//   pelas funções SQL da migração 20260924080000_pesquisa_sem_acentos.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: cors });
}

type Cliente = ReturnType<typeof createClient>;
type Posicao = { latitude: number; longitude: number };

async function lerMoradas(supabase: Cliente, filtrar: (q: any) => any, quemPede: string): Promise<MoradaLida[]> {
  const { data, error } = await filtrar(supabase.from("addresses").select(CAMPOS_MORADA).in("status", [...ESTADOS_PUBLICOS])).limit(MAX_RESULTADOS * 3);
  if (error) throw error;
  return ((data ?? []) as MoradaLida[]).filter((m) => podeVer(m, quemPede));
}

async function nomesDe(supabase: Cliente, tabela: "streets" | "neighborhoods", ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.from(tabela).select("id, name").in("id", unicos);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
}

async function comRuas(supabase: Cliente, moradas: MoradaLida[]): Promise<Resultado[]> {
  const ruas = await nomesDe(supabase, "streets", moradas.map((m) => m.street_id));
  return moradas.map((m) => resultadoMorada(m, m.street_id ? ruas.get(m.street_id) ?? null : null));
}

/** Uma morada visível de cada rua/bairro, para pôr o mapa lá. */
async function posicoesPor(supabase: Cliente, coluna: "street_id" | "neighborhood_id", ids: string[], quemPede: string) {
  const posicoes = new Map<string, Posicao>();
  if (ids.length === 0) return posicoes;
  const moradas = await lerMoradas(supabase, (q) => q.in(coluna, ids), quemPede);
  for (const m of moradas) {
    const id = m[coluna];
    if (id && !posicoes.has(id) && typeof m.latitude === "number" && typeof m.longitude === "number") {
      posicoes.set(id, { latitude: m.latitude, longitude: m.longitude });
    }
  }
  return posicoes;
}

type RuaLida = { id: string; name: string; neighborhood_id: string | null; origin_lat: number | null; origin_lng: number | null };

/** Ruas cujo nome contém o texto, sem ligar a acentos nem a maiúsculas. */
async function ruasComNome(supabase: Cliente, texto: string): Promise<RuaLida[]> {
  const { data, error } = await supabase.rpc("pesquisa_ruas", { p_padrao: padraoContem(texto), p_limite: MAX_RESULTADOS });
  if (error) throw error;
  return (data ?? []) as RuaLida[];
}

async function pesquisarTexto(supabase: Cliente, texto: string, quemPede: string): Promise<Resultado[]> {
  const padrao = padraoContem(texto);
  const [listaRuas, bairros, referencias] = await Promise.all([
    ruasComNome(supabase, texto),
    supabase.rpc("pesquisa_bairros", { p_padrao: padrao, p_limite: MAX_RESULTADOS }),
    supabase.rpc("pesquisa_moradas_por_referencia", { p_padrao: padrao, p_estados: [...ESTADOS_PUBLICOS], p_limite: MAX_RESULTADOS * 3 }),
  ]);
  if (bairros.error) throw bairros.error;
  if (referencias.error) throw referencias.error;
  const moradas = ((referencias.data ?? []) as MoradaLida[]).filter((m) => podeVer(m, quemPede));
  const listaBairros = (bairros.data ?? []) as { id: string; name: string }[];

  const [posRuas, posBairros, bairrosDasRuas] = await Promise.all([
    posicoesPor(supabase, "street_id", listaRuas.map((r) => r.id), quemPede),
    posicoesPor(supabase, "neighborhood_id", listaBairros.map((b) => b.id), quemPede),
    nomesDe(supabase, "neighborhoods", listaRuas.map((r) => r.neighborhood_id)),
  ]);

  return juntarResultados([
    listaRuas.map((r) => {
      const origem = typeof r.origin_lat === "number" && typeof r.origin_lng === "number" ? { latitude: r.origin_lat, longitude: r.origin_lng } : null;
      const bairro = r.neighborhood_id ? bairrosDasRuas.get(r.neighborhood_id) ?? null : null;
      return resultadoLugar("rua", r.id, r.name, bairro ? `Rua · ${bairro}` : "Rua", origem ?? posRuas.get(r.id) ?? null);
    }),
    listaBairros.map((b) => resultadoLugar("bairro", b.id, b.name, "Bairro", posBairros.get(b.id) ?? null)),
    await comRuas(supabase, moradas),
  ]);
}

/** action=cartao: o cartão público de uma morada (sem sessão). */
async function cartao(supabase: Cliente, body: any) {
  const codigo = interpretarCodigo(body?.query);
  if (!codigo) return responder({ error: "codigo postal ou Plus Code completo em falta" }, 400);
  const { data, error } = await supabase
    .from("addresses")
    .select(`${CAMPOS_MORADA}, quadra_id`)
    .eq(codigo.tipo === "codigo_postal" ? "postal_code" : "plus_code", codigo.valor)
    .in("status", [...ESTADOS_PUBLICOS])
    .limit(5);
  if (error) throw error;
  const m = ((data ?? []) as MoradaLida[]).find(podeVerPublico);
  if (!m) return responder({ found: false });
  const [ruas, quadra] = await Promise.all([
    nomesDe(supabase, "streets", [m.street_id]),
    m.quadra_id ? supabase.from("quadras").select("code").eq("id", m.quadra_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (quadra.error) throw quadra.error;
  const rua = m.street_id ? ruas.get(m.street_id) ?? null : null;
  return responder({ found: true, address: cartaoPublico(m, rua, (quadra.data as { code?: string } | null)?.code ?? null) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "use POST" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (new URL(req.url).searchParams.get("action") === "cartao") {
    try {
      return await cartao(supabase, await req.json().catch(() => ({})));
    } catch (e) {
      console.error("cartao falhou", e instanceof Error ? e.message : e);
      return responder({ error: "nao foi possivel procurar agora" }, 500);
    }
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const quemPede = authData?.user?.id;
  if (!quemPede) return responder({ error: "sessao invalida" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const pedido = interpretar(body?.query);
    if (!pedido) return responder({ error: "escreve entre 3 e 80 letras" }, 400);

    let resultados: Resultado[];
    if (pedido.tipo === "codigo_postal") {
      resultados = await comRuas(supabase, await lerMoradas(supabase, (q) => q.eq("postal_code", pedido.valor), quemPede));
    } else if (pedido.tipo === "plus_code") {
      resultados = await comRuas(supabase, await lerMoradas(supabase, (q) => q.ilike("plus_code", padraoContem(pedido.valor)), quemPede));
    } else if (pedido.tipo === "rua_numero") {
      const ids = (await ruasComNome(supabase, pedido.rua)).map((r) => r.id);
      resultados = ids.length === 0
        ? []
        : await comRuas(supabase, await lerMoradas(supabase, (q) => q.in("street_id", ids).eq("house_number", pedido.numero), quemPede));
    } else {
      resultados = await pesquisarTexto(supabase, pedido.valor, quemPede);
    }

    return responder({ tipo: pedido.tipo, resultados: juntarResultados([resultados]) });
  } catch (e) {
    console.error("pesquisa falhou", e instanceof Error ? e.message : e);
    return responder({ error: "nao foi possivel pesquisar agora" }, 500);
  }
});
