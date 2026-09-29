import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Invite Service (agora regista onboarded_via = INVITE_EMAIL)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ROLE_RANK: Record<string, number> = {
  super_admin: 0, admin_nacional: 1, admin_provincial: 2, admin_municipal: 3,
  supervisor: 4, auditor: 5, operador_postal: 5, tecnico_campo: 5, estafeta: 5, empresa: 5, cidadao: 9,
};

const ALLOWED_INVITES: Record<string, string[]> = {
  super_admin: ["super_admin", "admin_nacional", "admin_provincial", "admin_municipal", "auditor", "operador_postal", "supervisor", "tecnico_campo", "estafeta"],
  admin_nacional: ["admin_provincial", "admin_municipal", "auditor", "operador_postal", "supervisor", "tecnico_campo", "estafeta"],
  admin_provincial: ["admin_municipal", "auditor", "operador_postal", "supervisor", "tecnico_campo", "estafeta"],
  admin_municipal: ["auditor", "operador_postal", "supervisor", "tecnico_campo", "estafeta"],
  supervisor: ["tecnico_campo", "estafeta"],
  auditor: [], operador_postal: [], tecnico_campo: [], estafeta: [],
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
  if (!callerId) {
    return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });
  }

  try {
    const { data: callerMemberships } = await supabase
      .from("organization_members")
      .select("role, organization_id, scope_province_id, scope_municipality_id")
      .eq("user_id", callerId);

    if (!callerMemberships || callerMemberships.length === 0) {
      return new Response(JSON.stringify({ error: "nao tens nenhum cargo atribuido - nao podes convidar ninguem" }), { status: 403, headers: cors });
    }
    const callerBest = callerMemberships.reduce((best, m) =>
      (ROLE_RANK[m.role] ?? 9) < (ROLE_RANK[best.role] ?? 9) ? m : best
    );
    const callerRole = callerBest.role;
    const callerRank = ROLE_RANK[callerRole] ?? 9;

    const body = await req.json();
    const { email, role, organization_id, province_id, municipality_id, confirm } = body;

    if (!email || !role) {
      return new Response(JSON.stringify({ error: "email e role sao obrigatorios" }), { status: 400, headers: cors });
    }

    const allowed = ALLOWED_INVITES[callerRole] ?? [];
    if (!allowed.includes(role)) {
      return new Response(JSON.stringify({ error: `o teu cargo (${callerRole}) nao pode convidar/atribuir o cargo "${role}"` }), { status: 403, headers: cors });
    }

    let targetOrganizationId: string;
    if (callerRole === "super_admin") {
      if (!organization_id) {
        return new Response(JSON.stringify({ error: "organization_id (setor) e obrigatorio" }), { status: 400, headers: cors });
      }
      const { data: org } = await supabase.from("organizations").select("id").eq("id", organization_id).maybeSingle();
      if (!org) return new Response(JSON.stringify({ error: "setor/organizacao nao encontrado" }), { status: 400, headers: cors });
      targetOrganizationId = organization_id;
    } else {
      if (organization_id && organization_id !== callerBest.organization_id) {
        return new Response(JSON.stringify({ error: "nao podes convidar para um setor diferente do teu" }), { status: 403, headers: cors });
      }
      targetOrganizationId = callerBest.organization_id;
    }

    let scopeProvinceId: string | null = null;
    let scopeMunicipalityId: string | null = null;

    if (role === "admin_provincial") {
      if (!province_id) return new Response(JSON.stringify({ error: "province_id e obrigatorio para admin_provincial" }), { status: 400, headers: cors });
      scopeProvinceId = province_id;
    } else if (role === "admin_municipal") {
      if (!municipality_id) return new Response(JSON.stringify({ error: "municipality_id e obrigatorio para admin_municipal" }), { status: 400, headers: cors });
      const { data: muni } = await supabase.from("municipalities").select("id, province_id").eq("id", municipality_id).single();
      if (!muni) return new Response(JSON.stringify({ error: "municipio nao encontrado" }), { status: 400, headers: cors });
      if (callerRole === "admin_provincial" && muni.province_id !== callerBest.scope_province_id) {
        return new Response(JSON.stringify({ error: "esse municipio nao pertence a tua provincia" }), { status: 403, headers: cors });
      }
      scopeMunicipalityId = municipality_id;
      scopeProvinceId = muni.province_id;
    } else {
      scopeProvinceId = callerBest.scope_province_id ?? province_id ?? null;
      scopeMunicipalityId = callerBest.scope_municipality_id ?? municipality_id ?? null;
    }

    let existingUserId: string | null = null;
    {
      let page = 1;
      while (!existingUserId) {
        const { data: listRes } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        const found = listRes?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) { existingUserId = found.id; break; }
        if (!listRes || listRes.users.length < 200) break;
        page++;
        if (page > 20) break;
      }
    }

    if (existingUserId) {
      const { data: existingMemberships } = await supabase
        .from("organization_members")
        .select("id, role, organization_id, scope_province_id, scope_municipality_id")
        .eq("user_id", existingUserId);

      const existingBest = existingMemberships && existingMemberships.length > 0
        ? existingMemberships.reduce((best, m) => (ROLE_RANK[m.role] ?? 9) < (ROLE_RANK[best.role] ?? 9) ? m : best)
        : null;

      if (existingBest) {
        const existingRank = ROLE_RANK[existingBest.role] ?? 9;
        const requestedRank = ROLE_RANK[role] ?? 9;

        if (existingRank <= requestedRank) {
          return new Response(JSON.stringify({
            error: `nao e possivel: este email ja tem o cargo "${existingBest.role}", que e igual ou superior ao cargo pedido`,
          }), { status: 409, headers: cors });
        }

        if (existingBest.organization_id !== targetOrganizationId && callerRole !== "super_admin") {
          return new Response(JSON.stringify({
            error: "este email ja pertence a outro setor/instituicao - so o super admin pode move-lo",
          }), { status: 409, headers: cors });
        }

        const sameJurisdiction =
          (existingBest.scope_province_id ?? null) === (scopeProvinceId ?? null) &&
          (existingBest.scope_municipality_id ?? null) === (scopeMunicipalityId ?? null);

        if (!sameJurisdiction && callerRank > ROLE_RANK.admin_nacional) {
          return new Response(JSON.stringify({
            error: "este email ja esta associado a outra jurisdicao - so um admin nacional ou super admin pode move-lo",
          }), { status: 409, headers: cors });
        }

        if (!confirm) {
          return new Response(JSON.stringify({
            needs_confirmation: true,
            current_role: existingBest.role,
            message: `Este email ja esta registado como "${existingBest.role}". Confirmas a alteracao para "${role}"?`,
          }), { headers: cors });
        }

        const { error: updateError } = await supabase
          .from("organization_members")
          .update({ role, organization_id: targetOrganizationId, scope_province_id: scopeProvinceId, scope_municipality_id: scopeMunicipalityId })
          .eq("id", existingBest.id);
        if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: cors });

        await supabase.from("audit_logs").insert({
          actor_id: callerId, action: "role_changed", entity_type: "user", entity_id: existingUserId,
          before: { role: existingBest.role }, after: { role },
        });

        return new Response(JSON.stringify({ ok: true, promoted: true, email, role }), { headers: cors });
      }

      const { error: memberError } = await supabase.from("organization_members").insert({
        organization_id: targetOrganizationId, user_id: existingUserId, role,
        scope_province_id: scopeProvinceId, scope_municipality_id: scopeMunicipalityId,
        onboarded_via: "INVITE_EMAIL",
      });
      if (memberError) return new Response(JSON.stringify({ error: memberError.message }), { status: 400, headers: cors });

      await supabase.from("audit_logs").insert({
        actor_id: callerId, action: "role_assigned_existing_user", entity_type: "user", entity_id: existingUserId,
        before: null, after: { role },
      });

      return new Response(JSON.stringify({ ok: true, assigned_to_existing_account: true, email, role }), { headers: cors });
    }

    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), { status: 400, headers: cors });
    }

    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: targetOrganizationId, user_id: invited.user.id, role,
      scope_province_id: scopeProvinceId, scope_municipality_id: scopeMunicipalityId,
      onboarded_via: "INVITE_EMAIL",
    });
    if (memberError) return new Response(JSON.stringify({ error: memberError.message }), { status: 400, headers: cors });

    await supabase.from("audit_logs").insert({
      actor_id: callerId, action: "user_invited", entity_type: "user", entity_id: invited.user.id,
      before: null, after: { email, role, organization_id: targetOrganizationId, onboarded_via: "INVITE_EMAIL" },
    });

    return new Response(JSON.stringify({ ok: true, invited_email: email, role }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
