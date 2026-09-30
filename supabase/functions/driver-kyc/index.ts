import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CAMPOS_FOTOS, limparCandidatura, paisDaConta, posicaoValida } from "./regras.ts";

// Angola Localiza - Candidatura de motorista (v4)
// status: a candidatura e o perfil de motorista de quem pede.
// submit: envia a candidatura (fotos em kyc-artifacts/<id>/…); fica PENDING_REVIEW.
// set_online: um motorista aprovado fica disponível (ou não) para receber pedidos.
// list_pending / view / review: só administradores (is_admin); ninguém revê a própria.
// v4 corrige a v3: os erros ao gravar eram ignorados (lia "rowError" em vez de
// "error"); o país da conta passa a vir do registo quando falta o perfil do país;
// não havia forma de aprovar nem de ficar disponível.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: cors });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: a } = await supabase.auth.getUser(token);
  const uid = a?.user?.id;
  if (!uid) return out({ error: "SESSAO_INVALIDA" }, 401);

  const eAdmin = async () => (await supabase.rpc("is_admin", { check_user_id: uid })).data === true;

  try {
    const action = new URL(req.url).searchParams.get("action") || "status";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (action === "status") {
      const { data } = await supabase.from("driver_applications").select("*").eq("user_id", uid).maybeSingle();
      const { data: profile } = await supabase.from("driver_profiles").select("country_code,status,online,vehicle_type,vehicle_plate,vehicle_capacity_kg,latitude,longitude").eq("user_id", uid).maybeSingle();
      return out({ application: data, profile });
    }

    if (action === "submit") {
      const limpa = limparCandidatura(body, uid);
      if (!limpa.ok) return out({ error: limpa.erro }, 422);
      const { data: perfil } = await supabase.from("user_country_profiles").select("country_code").eq("user_id", uid).maybeSingle();
      const country = paisDaConta(perfil?.country_code, a.user?.user_metadata);
      if (!perfil) await supabase.from("user_country_profiles").upsert({ user_id: uid, country_code: country }, { onConflict: "user_id" });

      const { data: exist } = await supabase.from("driver_applications").select("status").eq("user_id", uid).maybeSingle();
      if (exist?.status === "APPROVED") return out({ ok: true, status: "APPROVED" });
      if (exist?.status === "PENDING_REVIEW") return out({ error: "CANDIDATURA_JA_EM_REVISAO" }, 409);

      const { data, error } = await supabase.from("driver_applications").upsert({
        user_id: uid, country_code: country, status: "PENDING_REVIEW", ...limpa.linha,
        submitted_at: new Date().toISOString(), rejection_reason: null, reviewed_at: null, reviewed_by: null,
      }, { onConflict: "user_id" }).select("id,status,country_code,submitted_at").single();
      if (error) return out({ error: error.message }, 400);
      return out({ ok: true, application: data });
    }

    if (action === "set_online") {
      const { data: profile } = await supabase.from("driver_profiles").select("status").eq("user_id", uid).maybeSingle();
      if (profile?.status !== "APPROVED") return out({ error: "MOTORISTA_KYC_NAO_APROVADO" }, 403);
      const online = body.online === true;
      const pos = posicaoValida(body.latitude, body.longitude);
      const agora = new Date().toISOString();
      const { error } = await supabase.from("driver_profiles").update({
        online, updated_at: agora, ...(pos ? { ...pos, location_updated_at: agora } : {}),
      }).eq("user_id", uid);
      if (error) return out({ error: error.message }, 400);
      return out({ ok: true, online });
    }

    if (action === "list_pending") {
      if (!(await eAdmin())) return out({ error: "APENAS_ADMINISTRADORES" }, 403);
      const { data, error } = await supabase.from("driver_applications")
        .select("user_id,country_code,status,vehicle_type,vehicle_plate,vehicle_capacity_kg,license_number,license_expiry,submitted_at")
        .eq("status", "PENDING_REVIEW").order("submitted_at").limit(100);
      if (error) return out({ error: error.message }, 400);
      const lista = [];
      for (const c of data ?? []) {
        if (c.user_id === uid) continue; // ninguém revê a própria
        const { data: u } = await supabase.auth.admin.getUserById(c.user_id);
        lista.push({
          user_id: c.user_id, country_code: c.country_code, status: c.status, vehicle_type: c.vehicle_type, vehicle_plate: c.vehicle_plate,
          vehicle_capacity_kg: c.vehicle_capacity_kg ?? null, license_number: c.license_number, license_expiry: c.license_expiry ?? null, submitted_at: c.submitted_at ?? null,
          email: u?.user?.email ?? null,
          full_name: (u?.user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? null,
        });
      }
      return out({ applications: lista });
    }

    if (action === "view") {
      if (!(await eAdmin())) return out({ error: "APENAS_ADMINISTRADORES" }, 403);
      if (typeof body.user_id !== "string" || !UUID.test(body.user_id)) return out({ error: "user_id invalido" }, 400);
      if (body.user_id === uid) return out({ error: "NAO_PODES_REVER_A_TUA_CANDIDATURA" }, 403);
      const { data: app } = await supabase.from("driver_applications").select("*").eq("user_id", body.user_id).maybeSingle();
      if (!app) return out({ error: "CANDIDATURA_NAO_ENCONTRADA" }, 404);
      const links: Record<string, string | null> = {};
      for (const c of CAMPOS_FOTOS) {
        const caminho = app[c];
        if (typeof caminho !== "string" || !caminho) { links[c] = null; continue; }
        const { data: s } = await supabase.storage.from("kyc-artifacts").createSignedUrl(caminho, 600);
        links[c] = s?.signedUrl ?? null;
      }
      await supabase.from("audit_logs").insert({ actor_id: uid, action: "driver_documents_viewed", entity_type: "driver_application", entity_id: app.id, before: null, after: { user_id: body.user_id } });
      return out({ links, expires_in_seconds: 600 });
    }

    if (action === "review") {
      if (!(await eAdmin())) return out({ error: "APENAS_ADMINISTRADORES" }, 403);
      if (typeof body.user_id !== "string" || !["approve", "reject"].includes(body.decision)) return out({ error: "REVISAO_INVALIDA" }, 400);
      if (body.user_id === uid) return out({ error: "NAO_PODES_REVER_A_TUA_CANDIDATURA" }, 403);
      const next = body.decision === "approve" ? "APPROVED" : "REJECTED";
      if (next === "REJECTED" && (typeof body.reason !== "string" || body.reason.trim().length < 5)) return out({ error: "MOTIVO_OBRIGATORIO" }, 422);
      const { data: app } = await supabase.from("driver_applications").select("*").eq("user_id", body.user_id).maybeSingle();
      if (!app || app.status !== "PENDING_REVIEW") return out({ error: "CANDIDATURA_NAO_ESTA_POR_REVER" }, 409);
      const now = new Date().toISOString();
      const { data: changed, error } = await supabase.from("driver_applications")
        .update({ status: next, reviewed_at: now, reviewed_by: uid, rejection_reason: next === "REJECTED" ? body.reason.trim() : null, updated_at: now })
        .eq("user_id", body.user_id).eq("status", "PENDING_REVIEW").select("id");
      if (error) return out({ error: error.message }, 400);
      if (!changed?.length) return out({ error: "REVISAO_CONCORRENTE" }, 409);
      if (next === "APPROVED") {
        const { error: e } = await supabase.from("driver_profiles").upsert({
          user_id: body.user_id, country_code: app.country_code, status: "APPROVED", online: false,
          vehicle_type: app.vehicle_type, vehicle_plate: app.vehicle_plate, vehicle_capacity_kg: app.vehicle_capacity_kg ?? null, updated_at: now,
        }, { onConflict: "user_id" });
        if (e) return out({ error: e.message }, 500);
      }
      await supabase.from("audit_logs").insert({ actor_id: uid, action: "driver_application_reviewed", entity_type: "driver_application", entity_id: app.id, before: { status: "PENDING_REVIEW" }, after: { status: next, user_id: body.user_id } });
      await supabase.from("notifications").insert({
        user_id: body.user_id,
        title: next === "APPROVED" ? "Candidatura de motorista aprovada" : "Candidatura de motorista recusada",
        body: next === "APPROVED" ? "Já podes ficar disponível e aceitar entregas." : "Motivo: " + body.reason.trim(),
        entity_type: "driver_application", entity_id: app.id,
      });
      return out({ ok: true, status: next });
    }

    return out({ error: "ACAO_DESCONHECIDA" }, 400);
  } catch (e) {
    return out({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
