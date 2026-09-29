import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Identity KYC Service (v2, PRONPET v5.18)
// - BI frente+verso obrigatorios.
// - Validacao de formato do numero do BI angolano.
// - Notificacoes reais no resultado da revisao.
// - Status devolve protocolo (8 chars do id) + timestamp da submissao.
// LIMITACAO HONESTA (mantida): sem deteccao automatica de liveness -
// confirmacao de desafios cumpridos e feita por humano revisor.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const CHALLENGES = ["pisca os olhos", "sorri", "vira a cabeca para a esquerda", "vira a cabeca para a direita"];
const KYC_PEPPER = "AL-KYC-2026-pepper-fixo";
const BI_REGEX = /^\d{9}[A-Z]{2}\d{2}$/;

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida" }), { status: 401, headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";
    const body = req.method === "POST" ? await req.json() : {};

    if (action === "status") {
      const { data } = await supabase.from("user_identity").select("*").eq("user_id", callerId).maybeSingle();
      const { data: lastSubmission } = await supabase.from("identity_verifications").select("id, created_at, status, rejection_reason").eq("user_id", callerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return new Response(JSON.stringify({
        status: data?.status || "PENDING_ID", resend_count: data?.resend_count || 0, cooldown_until: data?.cooldown_until || null,
        protocol: lastSubmission ? lastSubmission.id.slice(0, 8).toUpperCase() : null,
        submitted_at: lastSubmission?.created_at || null,
        last_rejection_reason: lastSubmission?.status === "REJECTED" ? lastSubmission.rejection_reason : null,
      }), { headers: cors });
    }

    if (action === "validate_bi") {
      const { id_number } = body;
      const valid = !!id_number && BI_REGEX.test(id_number.trim().toUpperCase());
      return new Response(JSON.stringify({ valid }), { headers: cors });
    }

    if (action === "get_challenge") {
      const shuffled = [...CHALLENGES].sort(() => Math.random() - 0.5).slice(0, 3);
      return new Response(JSON.stringify({ challenge_sequence: shuffled }), { headers: cors });
    }

    if (action === "submit_liveness") {
      const { id_number, id_photo_url, id_photo_back_url, video_url, video_duration_seconds, challenge_sequence } = body;
      if (!id_number || !id_photo_url || !id_photo_back_url || !video_url) {
        return new Response(JSON.stringify({ error: "id_number, foto da frente, foto do verso e video sao obrigatorios" }), { status: 400, headers: cors });
      }
      const idNumberNormalized = id_number.trim().toUpperCase();
      if (!BI_REGEX.test(idNumberNormalized)) {
        return new Response(JSON.stringify({ error: "numero do BI invalido - formato esperado: 9 digitos + 2 letras + 2 digitos (ex.: 008807453HO45)" }), { status: 422, headers: cors });
      }
      if (typeof video_duration_seconds === "number" && (video_duration_seconds < 8 || video_duration_seconds > 15)) {
        return new Response(JSON.stringify({ error: "LIVENESS_INVALID: o video tem de durar entre 8 e 15 segundos" }), { status: 422, headers: cors });
      }

      const { data: identity } = await supabase.from("user_identity").select("*").eq("user_id", callerId).maybeSingle();
      if (identity?.cooldown_until && new Date(identity.cooldown_until) > new Date()) {
        return new Response(JSON.stringify({ error: "RESENDS_EXHAUSTED: aguarda ate " + identity.cooldown_until + " ou pede revisao ao Admin Nacional" }), { status: 429, headers: cors });
      }
      const { data: pendingExisting } = await supabase.from("identity_verifications").select("id").eq("user_id", callerId).eq("status", "SUBMITTED").maybeSingle();
      if (pendingExisting) {
        return new Response(JSON.stringify({ error: "ja tens uma submissao em revisao - aguarda o resultado antes de enviar outra" }), { status: 409, headers: cors });
      }

      const idHash = await sha256(idNumberNormalized + KYC_PEPPER);
      const { data: dup } = await supabase.from("identity_verifications").select("user_id").eq("id_hash", idHash).neq("status", "REJECTED").neq("user_id", callerId).maybeSingle();
      if (dup) return new Response(JSON.stringify({ error: "IDENTITY_DUPLICATE: este BI ja esta associado a outra conta" }), { status: 409, headers: cors });

      const { data: verification, error } = await supabase.from("identity_verifications").insert({
        user_id: callerId, method: "LIVENESS_VIDEO", id_hash: idHash, id_last4: idNumberNormalized.slice(-4),
        id_photo_url, id_photo_back_url, video_url, video_duration_seconds, challenge_sequence,
      }).select("id").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("user_identity").upsert({ user_id: callerId, status: "PENDING_ID", updated_at: new Date().toISOString() });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "identity_submitted", entity_type: "identity_verification", entity_id: verification.id, before: null, after: { method: "LIVENESS_VIDEO" } });
      return new Response(JSON.stringify({ ok: true, verification_id: verification.id, protocol: verification.id.slice(0, 8).toUpperCase() }), { headers: cors });
    }

    if (action === "submit_presencial") {
      const { data: attesterMemberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      const isAttester = (attesterMemberships ?? []).some((m) => ["supervisor", "admin_municipal", "admin_provincial", "admin_nacional", "super_admin"].includes(m.role));
      const { data: attesterIdentity } = await supabase.from("user_identity").select("status").eq("user_id", callerId).maybeSingle();
      if (!isAttester || attesterIdentity?.status !== "ID_VERIFIED") {
        return new Response(JSON.stringify({ error: "apenas um supervisor/admin ja verificado pode atestar presencialmente" }), { status: 403, headers: cors });
      }
      const { target_user_id, id_number, id_photo_url } = body;
      if (!target_user_id || !id_number || !id_photo_url) {
        return new Response(JSON.stringify({ error: "target_user_id, id_number e id_photo_url sao obrigatorios" }), { status: 400, headers: cors });
      }
      const idHash = await sha256(id_number.trim().toUpperCase() + KYC_PEPPER);
      const { data: dup } = await supabase.from("identity_verifications").select("user_id").eq("id_hash", idHash).neq("status", "REJECTED").neq("user_id", target_user_id).maybeSingle();
      if (dup) return new Response(JSON.stringify({ error: "IDENTITY_DUPLICATE: este BI ja esta associado a outra conta" }), { status: 409, headers: cors });

      const { data: verification, error } = await supabase.from("identity_verifications").insert({
        user_id: target_user_id, method: "PRESENCIAL", id_hash: idHash, id_last4: id_number.trim().slice(-4),
        id_photo_url, attested_by: callerId, status: "APPROVED", reviewed_by: callerId, reviewed_at: new Date().toISOString(),
      }).select("id").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("user_identity").upsert({ user_id: target_user_id, status: "ID_VERIFIED", updated_at: new Date().toISOString() });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "identity_attested_presencial", entity_type: "identity_verification", entity_id: verification.id, before: null, after: { target_user_id } });
      return new Response(JSON.stringify({ ok: true, verification_id: verification.id }), { headers: cors });
    }

    if (action === "submit_org_attestation") {
      const { target_email, organization_id, note } = body;
      const { data: adminMembership } = await supabase.from("organization_members").select("role").eq("user_id", callerId).eq("organization_id", organization_id).maybeSingle();
      if (!adminMembership || !["admin_municipal", "admin_provincial", "admin_nacional", "super_admin"].includes(adminMembership.role)) {
        return new Response(JSON.stringify({ error: "apenas um admin dessa organizacao pode atestar" }), { status: 403, headers: cors });
      }
      let targetUserId: string | null = null; let page = 1;
      while (!targetUserId) {
        const { data: listRes } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        const found = listRes?.users?.find((u) => u.email?.toLowerCase() === target_email?.toLowerCase());
        if (found) { targetUserId = found.id; break; }
        if (!listRes || listRes.users.length < 200) break;
        page++; if (page > 20) break;
      }
      if (!targetUserId) return new Response(JSON.stringify({ error: "utilizador nao encontrado" }), { status: 404, headers: cors });

      const { data: verification, error } = await supabase.from("identity_verifications").insert({
        user_id: targetUserId, method: "ORG_ATTESTATION", organization_id, attested_by: callerId,
        status: "APPROVED", reviewed_by: callerId, reviewed_at: new Date().toISOString(), rejection_reason: note ?? null,
      }).select("id").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("user_identity").upsert({ user_id: targetUserId, status: "ID_VERIFIED", updated_at: new Date().toISOString() });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "identity_org_attestation", entity_type: "identity_verification", entity_id: verification.id, before: null, after: { target_email, organization_id } });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "list_pending_review") {
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      const canReview = (memberships ?? []).some((m) => ["super_admin", "admin_nacional", "auditor"].includes(m.role));
      if (!canReview) return new Response(JSON.stringify({ error: "apenas Super Admin, Admin Nacional ou Auditor" }), { status: 403, headers: cors });
      const { data, error } = await supabase.from("identity_verifications").select("id, user_id, method, id_last4, created_at").eq("status", "SUBMITTED").order("created_at");
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      const withEmails = [];
      for (const v of data ?? []) { const { data: u } = await supabase.auth.admin.getUserById(v.user_id); withEmails.push({ ...v, email: u?.user?.email, protocol: v.id.slice(0, 8).toUpperCase() }); }
      return new Response(JSON.stringify({ verifications: withEmails }), { headers: cors });
    }

    if (action === "view_artifact") {
      const { verification_id, artifact } = body;
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      const canReview = (memberships ?? []).some((m) => ["super_admin", "admin_nacional", "auditor"].includes(m.role));
      if (!canReview) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { data: v } = await supabase.from("identity_verifications").select("id_photo_url, id_photo_back_url, video_url").eq("id", verification_id).single();
      if (!v) return new Response(JSON.stringify({ error: "nao encontrado" }), { status: 404, headers: cors });
      const path = artifact === "video" ? v.video_url : artifact === "back" ? v.id_photo_back_url : v.id_photo_url;
      if (!path) return new Response(JSON.stringify({ error: "artefacto nao existe" }), { status: 404, headers: cors });
      const key = path.split("/kyc-artifacts/")[1] || path;
      const { data: signed } = await supabase.storage.from("kyc-artifacts").createSignedUrl(key, 300);
      await supabase.from("identity_artifact_views").insert({ verification_id, viewed_by: callerId });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "identity_artifact_viewed", entity_type: "identity_verification", entity_id: verification_id, before: null, after: { artifact } });
      return new Response(JSON.stringify({ url: signed?.signedUrl }), { headers: cors });
    }

    if (action === "review_decision") {
      const { verification_id, decision, reason } = body;
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      const canReview = (memberships ?? []).some((m) => ["super_admin", "admin_nacional", "auditor"].includes(m.role));
      if (!canReview) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });

      const { data: v } = await supabase.from("identity_verifications").select("user_id").eq("id", verification_id).single();
      if (!v) return new Response(JSON.stringify({ error: "nao encontrado" }), { status: 404, headers: cors });

      if (decision === "approve") {
        await supabase.from("identity_verifications").update({ status: "APPROVED", reviewed_by: callerId, reviewed_at: new Date().toISOString() }).eq("id", verification_id);
        await supabase.from("user_identity").upsert({ user_id: v.user_id, status: "ID_VERIFIED", updated_at: new Date().toISOString() });
        await supabase.from("notifications").insert({ user_id: v.user_id, title: "Identidade verificada ✅", body: "A tua identidade foi aprovada. Já podes usar Campo/Validar/etc.", entity_type: "identity_verification", entity_id: verification_id });
      } else {
        await supabase.from("identity_verifications").update({ status: "REJECTED", rejection_reason: reason, reviewed_by: callerId, reviewed_at: new Date().toISOString() }).eq("id", verification_id);
        const { data: identity } = await supabase.from("user_identity").select("resend_count").eq("user_id", v.user_id).maybeSingle();
        const newCount = (identity?.resend_count ?? 0) + 1;
        const update: Record<string, unknown> = { user_id: v.user_id, status: "PENDING_ID", resend_count: newCount, updated_at: new Date().toISOString() };
        if (newCount >= 3) update.cooldown_until = new Date(Date.now() + 7 * 86400000).toISOString();
        await supabase.from("user_identity").upsert(update);
        await supabase.from("notifications").insert({
          user_id: v.user_id, title: "Identidade rejeitada", body: "Motivo: " + reason + (newCount >= 3 ? " · Reenvios esgotados - aguarda 7 dias ou pede revisão ao Admin Nacional." : " · Podes reenviar (tentativa " + (newCount + 1) + "/3)."),
          entity_type: "identity_verification", entity_id: verification_id,
        });
      }
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "identity_reviewed", entity_type: "identity_verification", entity_id: verification_id, before: null, after: { decision, reason } });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "purge_expired") {
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      if (!(memberships ?? []).some((m) => m.role === "super_admin")) return new Response(JSON.stringify({ error: "apenas super_admin" }), { status: 403, headers: cors });
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
      const { data: expired } = await supabase.from("identity_verifications").select("id, id_photo_url, id_photo_back_url, video_url").lt("created_at", cutoff.toISOString());
      let purged = 0;
      for (const v of expired ?? []) {
        for (const path of [v.id_photo_url, v.id_photo_back_url, v.video_url]) {
          if (path) { const key = path.split("/kyc-artifacts/")[1] || path; await supabase.storage.from("kyc-artifacts").remove([key]); }
        }
        await supabase.from("identity_verifications").update({ id_photo_url: null, id_photo_back_url: null, video_url: null }).eq("id", v.id);
        purged++;
      }
      return new Response(JSON.stringify({ ok: true, purged }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
