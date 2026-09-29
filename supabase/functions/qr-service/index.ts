import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - QR Service (Fase 6, endurecido na Fase 16)
// generate/revoke confirmam a identidade pelo token de login real.
// resolve continua publico de proposito (e para quem NAO tem conta ler um
// QR fisico), por isso nao exige login.

function randomToken(length = 24): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

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

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "resolve";
    const body = req.method === "POST" ? await req.json() : {};

    async function getCallerId(): Promise<string | null> {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const { data } = await supabase.auth.getUser(token);
      return data?.user?.id ?? null;
    }

    if (action === "generate") {
      const callerId = await getCallerId();
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });

      const { address_id, type, expires_in_hours, max_uses } = body;
      if (!address_id || !type) {
        return new Response(JSON.stringify({ error: "address_id e type sao obrigatorios" }), { status: 400, headers: cors });
      }
      if (!["public", "private", "temporary", "delivery"].includes(type)) {
        return new Response(JSON.stringify({ error: "type invalido" }), { status: 400, headers: cors });
      }
      const token = randomToken(24);
      const expires_at = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600 * 1000).toISOString() : null;

      const { data, error } = await supabase
        .from("qr_codes")
        .insert({ token, type, address_id, created_by: callerId, expires_at, max_uses: max_uses ?? null })
        .select()
        .single();

      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ token: data.token, id: data.id, expires_at: data.expires_at }), { headers: cors });
    }

    if (action === "resolve") {
      const tokenValue = body.token || url.searchParams.get("token");
      if (!tokenValue) return new Response(JSON.stringify({ error: "token em falta" }), { status: 400, headers: cors });

      const { data: qr, error } = await supabase.from("qr_codes").select("*").eq("token", tokenValue).single();
      if (error || !qr) {
        return new Response(JSON.stringify({ valid: false, reason: "qr_nao_encontrado" }), { status: 404, headers: cors });
      }
      if (qr.revoked) {
        return new Response(JSON.stringify({ valid: false, reason: "qr_revogado" }), { status: 410, headers: cors });
      }
      if (qr.expires_at && new Date(qr.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, reason: "qr_expirado" }), { status: 410, headers: cors });
      }
      if (qr.max_uses !== null && qr.use_count >= qr.max_uses) {
        return new Response(JSON.stringify({ valid: false, reason: "qr_limite_de_usos_atingido" }), { status: 410, headers: cors });
      }

      await supabase.from("qr_codes").update({ use_count: qr.use_count + 1 }).eq("id", qr.id);

      const { data: address } = await supabase
        .from("addresses")
        .select("public_id, postal_code, plus_code, latitude, longitude, reference, status")
        .eq("id", qr.address_id)
        .single();

      return new Response(JSON.stringify({ valid: true, type: qr.type, address }), { headers: cors });
    }

    if (action === "revoke") {
      const callerId = await getCallerId();
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });

      const { token: tokenValue } = body;
      if (!tokenValue) {
        return new Response(JSON.stringify({ error: "token e obrigatorio" }), { status: 400, headers: cors });
      }
      const { data: qr } = await supabase.from("qr_codes").select("created_by").eq("token", tokenValue).single();
      const { data: isAdminRes } = await supabase.rpc("is_admin", { check_user_id: callerId });
      if (!qr || (qr.created_by !== callerId && !isAdminRes)) {
        return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      }
      await supabase.from("qr_codes").update({ revoked: true }).eq("token", tokenValue);
      return new Response(JSON.stringify({ revoked: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
