import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { codigoBase, SCHEME_VERSION, validatePostalCode } from "./codigoPostal.ts";

// Angola Localiza - PostalCodeService (esquema 2: grelha de 32 símbolos e siglas fixas)
// Formato: AO-{PROV}-{GRID8}[-{N}]-{CHK}. As contas estão em codigoPostal.ts
// (partilhado com a app, que calcula o mesmo sem rede).
// Pedido e resposta iguais aos da versão anterior (o site continua a funcionar).

async function generatePostalCode(supabase: ReturnType<typeof createClient>, latitude: number, longitude: number, provinceName?: string) {
  const { provinceCode, gridCode, base, checksum: chk } = codigoBase(latitude, longitude, provinceName);

  let candidate = `AO-${base}-${chk}`;
  let n = 1;
  while (true) {
    const { data } = await supabase.from("addresses").select("id").eq("postal_code", candidate).maybeSingle();
    if (!data) break;
    n++;
    candidate = `AO-${base}-${n}-${chk}`;
    if (n > 20) break; // limite de seguranca - celula anormalmente cheia
  }

  return { postal_code: candidate, scheme_version: SCHEME_VERSION, grid_code: gridCode, province_code: provinceCode, checksum: chk, disambiguator: n > 1 ? n : null };
}

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "generate";
    const body = req.method === "POST" ? await req.json() : {};

    if (action === "validate") {
      const code = body.postal_code;
      if (!code) return new Response(JSON.stringify({ error: "postal_code em falta" }), { status: 400, headers: cors });
      return new Response(JSON.stringify(validatePostalCode(code)), { headers: cors });
    }

    const { latitude, longitude, province_name } = body;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return new Response(JSON.stringify({ error: "latitude e longitude sao obrigatorios (numeros)" }), { status: 400, headers: cors });
    }
    const result = await generatePostalCode(supabase, latitude, longitude, province_name);
    return new Response(JSON.stringify(result), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
