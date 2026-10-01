import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Phone Verify Service (v1)
// Verificacao de telefone por SMS - obrigatoria para o cidadao comum poder
// registar moradas (casas/lojas/escolas). Usa o telefone (auth phone OTP) do
// Supabase - SO FUNCIONA DE VERDADE depois de um fornecedor de SMS estar
// configurado no painel do Supabase (Authentication > Providers > Phone).
// Sem isso configurado, o pedido de OTP falha com um erro claro.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Chave pública (anon) do ambiente das Edge Functions, como na sync.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";
    const body = req.method === "POST" ? await req.json() : {};

    if (action === "status") {
      const { data } = await supabase.from("user_identity").select("phone, phone_verified").eq("user_id", callerId).maybeSingle();
      return new Response(JSON.stringify({ phone: data?.phone ?? null, phone_verified: data?.phone_verified ?? false }), { headers: cors });
    }

    if (action === "send_otp") {
      const { phone, country_code = "AO" } = body;
      const cc = String(country_code).toUpperCase();
      const { data: country } = await supabase.from("country_configs").select("country_code,phone_country_code,enabled,is_active").eq("country_code", cc).maybeSingle();
      if (!country || !country.enabled || !country.is_active || !country.phone_country_code) {
        return new Response(JSON.stringify({ error: "country_not_active" }), { status: 409, headers: cors });
      }
      const prefix = String(country.phone_country_code).replace(/\D/g, "");
      const digits = String(phone || "").replace(/\s+/g, "");
      const phoneRegex = new RegExp("^\\+" + prefix + "\\d{7,12}$");
      if (!phoneRegex.test(digits)) {
        return new Response(JSON.stringify({ error: "numero_invalido", country_code: cc, expected_prefix: "+" + prefix }), { status: 422, headers: cors });
      }
      const { data: existing } = await supabase.from("user_identity").select("phone_otp_sent_at").eq("user_id", callerId).maybeSingle();
      if (existing?.phone_otp_sent_at && (Date.now() - new Date(existing.phone_otp_sent_at).getTime()) < 60000) {
        return new Response(JSON.stringify({ error: "RESENDS_TOO_SOON: espera um minuto antes de pedir outro codigo" }), { status: 429, headers: cors });
      }
      const resp = await fetch(supabaseUrl + "/auth/v1/otp", {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": anonKey },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: "SMS_PROVIDER_NOT_CONFIGURED: o envio de SMS ainda nao esta ligado no painel do Supabase (Authentication > Providers > Phone). Detalhe: " + (data.msg || data.error_description || JSON.stringify(data)) }), { status: 501, headers: cors });
      }
      await supabase.from("user_identity").upsert({ user_id: callerId, phone: phone.trim(), phone_otp_sent_at: new Date().toISOString() });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "verify_otp") {
      const { phone, code } = body;
      if (!phone || !code) return new Response(JSON.stringify({ error: "phone e code sao obrigatorios" }), { status: 400, headers: cors });
      const resp = await fetch(supabaseUrl + "/auth/v1/verify", {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": anonKey },
        body: JSON.stringify({ type: "sms", phone: phone.trim(), token: code.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) return new Response(JSON.stringify({ error: data.msg || data.error_description || "codigo invalido ou expirado" }), { status: 400, headers: cors });
      await supabase.from("user_identity").upsert({ user_id: callerId, phone: phone.trim(), phone_verified: true, updated_at: new Date().toISOString() });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "phone_verified", entity_type: "user_identity", entity_id: callerId, before: null, after: { phone: phone.trim() } });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
