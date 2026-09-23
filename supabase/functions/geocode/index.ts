import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  coordenadasValidas,
  ERRO_SEM_CHAVE,
  esconderChave,
  lerChave,
  urlOptimize,
  urlReverse,
} from "./locationiq.ts";

// Angola Localiza - Geocode Proxy (v2)
// App/site -> esta funcao -> LocationIQ. A chave da LocationIQ vem do segredo
// LOCATIONIQ_KEY (Supabase > Edge Functions > Secrets), nunca do codigo, e
// nunca aparece nas respostas nem nos registos. Limite de pedidos por utilizador.
const LIMITE_POR_MINUTO = 30; // generoso para uso humano normal, mas trava um script a abusar

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const chave = lerChave((nome) => Deno.env.get(nome));
  if (!chave) {
    console.error(ERRO_SEM_CHAVE);
    return resposta({ error: ERRO_SEM_CHAVE }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return resposta({ error: "sessao invalida - inicia sessao novamente" }, 401);

  // Limite de pedidos por utilizador (nao so por chave global) - o mesmo padrao ja usado nas chaves de API
  const { data: limite } = await supabase.from("geocode_rate_limits").select("*").eq("user_id", callerId).maybeSingle();
  const agora = new Date();
  if (!limite) {
    await supabase.from("geocode_rate_limits").insert({ user_id: callerId, window_started_at: agora.toISOString(), requests_this_window: 1 });
  } else {
    const janelaExpirou = agora.getTime() - new Date(limite.window_started_at).getTime() > 60000;
    if (janelaExpirou) {
      await supabase.from("geocode_rate_limits").update({ window_started_at: agora.toISOString(), requests_this_window: 1 }).eq("user_id", callerId);
    } else {
      if (limite.requests_this_window >= LIMITE_POR_MINUTO) {
        return resposta({ error: "Demasiados pedidos seguidos - espera um pouco." }, 429);
      }
      await supabase.from("geocode_rate_limits").update({ requests_this_window: limite.requests_this_window + 1 }).eq("user_id", callerId);
    }
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const body = await req.json();

    if (action === "reverse") {
      const { latitude, longitude } = body;
      if (typeof latitude !== "number" || typeof longitude !== "number") return resposta({ error: "latitude e longitude sao obrigatorios" }, 400);
      const resp = await fetch(urlReverse(chave, latitude, longitude));
      return resposta(await resp.json());
    }

    if (action === "optimize") {
      const { coords_string } = body;
      if (!coords_string) return resposta({ error: "coords_string e obrigatorio" }, 400);
      if (!coordenadasValidas(coords_string)) return resposta({ error: "coords_string invalido (lng,lat;lng,lat;...)" }, 400);
      const resp = await fetch(urlOptimize(chave, coords_string));
      return resposta(await resp.json());
    }

    return resposta({ error: "acao desconhecida" }, 400);
  } catch (e) {
    // Um erro de rede pode trazer o URL (com a chave) na mensagem: esconde-a sempre.
    return resposta({ error: esconderChave(String(e), chave) }, 500);
  }
});
