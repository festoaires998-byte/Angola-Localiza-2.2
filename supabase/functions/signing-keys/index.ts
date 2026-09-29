import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Signing Keys Service (v1)
// Regista a chave publica de um aparelho, uma vez, para que as assinaturas
// digitais das provas de entrega possam depois ser verificadas a serio.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "register";
    const body = await req.json();

    if (action === "register") {
      const { device_id, public_key_jwk } = body;
      if (!device_id || !public_key_jwk) return new Response(JSON.stringify({ error: "device_id e public_key_jwk sao obrigatorios" }), { status: 400, headers: cors });
      const { error } = await supabase.from("signing_keys").upsert({ user_id: callerId, device_id, public_key_jwk }, { onConflict: "user_id,device_id" });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "status") {
      const { device_id } = body;
      const { data } = await supabase.from("signing_keys").select("device_id").eq("user_id", callerId).eq("device_id", device_id).maybeSingle();
      return new Response(JSON.stringify({ registered: !!data }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
