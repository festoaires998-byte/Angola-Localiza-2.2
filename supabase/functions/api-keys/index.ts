import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - API Keys Service (v3)
// Gestao de chaves de API por organizacao: criar, listar, revogar.
// A chave em si SO e mostrada uma vez, no momento da criacao (nunca fica
// guardada em texto simples - so o hash e o prefixo para identificacao).

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function gerarChaveAleatoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
  return "al_live_" + b64;
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

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });

  async function minhaOrganizacaoComPermissao(): Promise<string | null> {
    const { data: memberships } = await supabase.from("organization_members").select("role, organization_id").eq("user_id", callerId);
    const isSuperAdmin = (memberships ?? []).some((m) => m.role === "super_admin");
    if (isSuperAdmin) return (memberships ?? [])[0]?.organization_id ?? null;
    const cargosPermitidos = ["operador_postal", "admin_municipal", "admin_provincial", "admin_nacional", "empresa"];
    const meu = (memberships ?? []).find((m) => cargosPermitidos.includes(m.role));
    return meu?.organization_id ?? null;
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (action === "list") {
      const orgId = await minhaOrganizacaoComPermissao();
      if (!orgId) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { data } = await supabase.from("api_keys").select("id, name, key_prefix, rate_limit_per_minute, revoked, last_used_at, created_at").eq("organization_id", orgId).order("created_at", { ascending: false });
      return new Response(JSON.stringify({ keys: data ?? [] }), { headers: cors });
    }

    if (action === "create") {
      const orgId = await minhaOrganizacaoComPermissao();
      if (!orgId) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { name, rate_limit_per_minute } = body;
      if (!name || !name.trim()) return new Response(JSON.stringify({ error: "da um nome a chave (ex.: nome do sistema que a vai usar)" }), { status: 400, headers: cors });
      const chave = gerarChaveAleatoria();
      const hash = await sha256(chave);
      const prefixo = chave.slice(0, 12) + "...";
      const { data, error } = await supabase.from("api_keys").insert({
        organization_id: orgId, name: name.trim(), key_hash: hash, key_prefix: prefixo,
        created_by: callerId, rate_limit_per_minute: rate_limit_per_minute && rate_limit_per_minute > 0 ? rate_limit_per_minute : 60,
      }).select("id").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true, id: data.id, api_key: chave }), { headers: cors });
    }

    if (action === "revoke") {
      const orgId = await minhaOrganizacaoComPermissao();
      if (!orgId) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { key_id } = body;
      if (!key_id) return new Response(JSON.stringify({ error: "key_id e obrigatorio" }), { status: 400, headers: cors });
      const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", key_id).eq("organization_id", orgId);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
