import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Join Links Service (Canal 2 do onboarding)
// So cargos operacionais (tecnico_campo, estafeta). Nunca concede cargo >=
// ao de quem cria, nem escopo fora do escopo de quem cria (least-privilege).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ROLE_RANK: Record<string, number> = {
  super_admin: 0, admin_nacional: 1, admin_provincial: 2, admin_municipal: 3,
  supervisor: 4, auditor: 5, operador_postal: 5, tecnico_campo: 5, estafeta: 5,
};

// Quem pode criar links, e para que cargos
 const ALLOWED_LINK_CREATORS: Record<string, string[]> = {
  super_admin: ["tecnico_campo", "estafeta"],
  admin_nacional: ["tecnico_campo", "estafeta"],
  admin_provincial: ["tecnico_campo", "estafeta"],
  admin_municipal: ["tecnico_campo", "estafeta"],
  supervisor: ["tecnico_campo", "estafeta"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "consume";
    const body = await req.json();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData } = await supabase.auth.getUser(token);
    const callerId = authData?.user?.id;

    if (action === "create") {
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida" }), { status: 401, headers: cors });
      const { data: memberships } = await supabase.from("organization_members")
        .select("role, organization_id, scope_province_id, scope_municipality_id").eq("user_id", callerId);
      if (!memberships || memberships.length === 0) return new Response(JSON.stringify({ error: "sem cargo atribuido" }), { status: 403, headers: cors });
      const best = memberships.reduce((b, m) => (ROLE_RANK[m.role] ?? 9) < (ROLE_RANK[b.role] ?? 9) ? m : b);

      const allowedRoles = ALLOWED_LINK_CREATORS[best.role] ?? [];
      const { role, max_uses, expires_in_days } = body;
      if (!allowedRoles.includes(role)) {
        return new Response(JSON.stringify({ error: `o teu cargo (${best.role}) nao pode criar links para "${role}"` }), { status: 403, headers: cors });
      }

      const { data: link, error } = await supabase.from("join_links").insert({
        created_by: callerId, organization_id: best.organization_id, role,
        scope_province_id: best.scope_province_id, scope_municipality_id: best.scope_municipality_id,
        max_uses: max_uses ?? 10,
        expires_at: new Date(Date.now() + (expires_in_days ?? 7) * 86400000).toISOString(),
      }).select("id, token").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("audit_logs").insert({
        actor_id: callerId, action: "join_link_created", entity_type: "join_link", entity_id: link.id,
        before: null, after: { role, max_uses: max_uses ?? 10 },
      });

      return new Response(JSON.stringify({ ok: true, token: link.token, id: link.id }), { headers: cors });
    }

    if (action === "list") {
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida" }), { status: 401, headers: cors });
      const { data: memberships } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", callerId);
      const orgIds = (memberships ?? []).map(m=>m.organization_id).filter(Boolean);
      let query = supabase.from("join_links").select("*").order("created_at", { ascending: false });
      if (!memberships?.some(m=>m.role==="super_admin")) query = orgIds.length ? query.in("organization_id", orgIds) : query.eq("created_by", callerId);
      const { data, error } = await query;
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ links: data }), { headers: cors });
    }

    if (action === "revoke") {
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida" }), { status: 401, headers: cors });
      const { link_id } = body;
      const { data: link } = await supabase.from("join_links").select("created_by,organization_id").eq("id", link_id).single();
      const { data: membership } = await supabase.from("organization_members").select("role").eq("user_id", callerId).eq("organization_id", link?.organization_id).maybeSingle();
      const canRevoke = !!membership && ["super_admin","admin_nacional","admin_provincial","admin_municipal","supervisor"].includes(membership.role);
      if (!link || (link.created_by !== callerId && !canRevoke)) {
        return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      }
      await supabase.from("join_links").update({ revoked: true }).eq("id", link_id);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "resolve") {
      // Info publica minima para mostrar "vais entrar como Estafeta na provincia X" antes do registo
      const { token: linkToken } = body;
      const { data: link } = await supabase.from("join_links").select("role, revoked, expires_at, use_count, max_uses, scope_province_id").eq("token", linkToken).maybeSingle();
      if (!link) return new Response(JSON.stringify({ valid: false }), { status: 404, headers: cors });
      if (link.revoked || link.use_count >= link.max_uses || new Date(link.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, reason: "LINK_DEAD" }), { status: 410, headers: cors });
      }
      let provinceName = null;
      if (link.scope_province_id) {
        const { data: p } = await supabase.from("provinces").select("name").eq("id", link.scope_province_id).single();
        provinceName = p?.name;
      }
      return new Response(JSON.stringify({ valid: true, role: link.role, province_name: provinceName }), { headers: cors });
    }

    if (action === "consume") {
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao/regista-te primeiro" }), { status: 401, headers: cors });
      const { token: linkToken } = body;
      const { data: atomicResult, error: atomicError } = await supabase.rpc("consume_join_link", { p_token: linkToken, p_user_id: callerId });
      if (atomicError) return new Response(JSON.stringify({ error: atomicError.message }), { status: atomicError.message.includes("LINK_DEAD") ? 410 : 400, headers: cors });
      const consumed = Array.isArray(atomicResult) ? atomicResult[0] : atomicResult;
      if (!consumed?.ok) return new Response(JSON.stringify({ error: "nao foi possivel consumir o link" }), { status: 409, headers: cors });
      return new Response(JSON.stringify({ ok: true, role: consumed.role, requires_mfa: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
