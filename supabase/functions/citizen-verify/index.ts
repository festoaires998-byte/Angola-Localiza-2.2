import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { BUCKET, contactoDoCidadao, estadoPublico, validarPedido, validarRevisao } from "./regras.ts";

// Angola Localiza - Citizen Verify Service (v4)
// Verificacao simples do cidadao comum (para poder registar casas/lojas/escolas):
// BI frente + BI verso + selfie (por camara, com marca de agua aplicada no cliente),
// no bucket PRIVADO kyc-artifacts.
// v3 (seguranca):
//   - submit confirma no Storage que os 3 ficheiros existem e foram enviados
//     por quem faz o pedido (funcao SQL kyc_artefactos_do_utilizador);
//   - ja NAO aprova sozinho: fica "Por rever" (citizen_id_status =
//     PENDING_REVIEW). citizen_id_verified (o que a field-service consulta) so
//     fica true quando um administrador aprova (action=review).
//   - list_pending / review: so administradores (is_admin).
// v4: list_pending devolve tambem o email, o nome (se a conta o tiver) e o
//   telefone do cidadao, para o administrador saber quem esta a rever.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return resposta({ error: "sessao invalida - inicia sessao novamente" }, 401);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (action === "status") {
      const { data } = await supabase.from("user_identity")
        .select("citizen_id_verified, citizen_id_status, citizen_id_rejection_reason")
        .eq("user_id", callerId).maybeSingle();
      return resposta(estadoPublico(data));
    }

    if (action === "submit") {
      const v = validarPedido(body);
      if (!v.ok) return resposta({ error: v.erro }, 400);

      const { data: atual } = await supabase.from("user_identity")
        .select("citizen_id_verified, citizen_id_status").eq("user_id", callerId).maybeSingle();
      if (atual?.citizen_id_verified === true) return resposta({ ok: true, status: "VERIFIED" });

      // Os 3 ficheiros têm de existir no bucket privado e ter sido enviados por quem pede.
      const { data: encontrados, error: erroRpc } = await supabase.rpc("kyc_artefactos_do_utilizador", { nomes: v.nomes, utilizador: callerId });
      if (erroRpc) return resposta({ error: "nao foi possivel confirmar as fotos: " + erroRpc.message }, 500);
      if (encontrados !== 3) {
        return resposta({ error: "ARTIFACTS_MISSING: as 3 fotos tem de estar enviadas (por ti) antes de pedir a verificacao" }, 422);
      }

      const { error } = await supabase.from("user_identity").upsert({
        user_id: callerId, citizen_id_verified: false, citizen_id_status: "PENDING_REVIEW",
        citizen_id_photo_front_url: v.pedido.id_photo_front_url, citizen_id_photo_back_url: v.pedido.id_photo_back_url,
        citizen_selfie_url: v.pedido.selfie_url, citizen_id_submitted_at: new Date().toISOString(),
        citizen_id_reviewed_by: null, citizen_id_reviewed_at: null, citizen_id_rejection_reason: null,
      });
      if (error) return resposta({ error: error.message }, 400);
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "citizen_id_submitted", entity_type: "user_identity", entity_id: callerId, before: null, after: { status: "PENDING_REVIEW" } });
      return resposta({ ok: true, status: "PENDING_REVIEW" });
    }

    if (action === "list_pending" || action === "review") {
      const { data: admin } = await supabase.rpc("is_admin", { check_user_id: callerId });
      if (!admin) return resposta({ error: "apenas administradores" }, 403);

      if (action === "list_pending") {
        const { data, error } = await supabase.from("user_identity")
          .select("user_id, phone, citizen_id_photo_front_url, citizen_id_photo_back_url, citizen_selfie_url, citizen_id_submitted_at")
          .eq("citizen_id_status", "PENDING_REVIEW").order("citizen_id_submitted_at", { ascending: true }).limit(30);
        if (error) return resposta({ error: error.message }, 400);
        const pedidos = [];
        for (const p of data ?? []) {
          // Links temporários (10 min) para o administrador ver as fotos privadas.
          const assinar = async (nome: string | null) => nome ? (await supabase.storage.from(BUCKET).createSignedUrl(nome, 600)).data?.signedUrl ?? null : null;
          // Email e nome da conta (auth.users): so a service role os le.
          const { data: conta } = await supabase.auth.admin.getUserById(p.user_id);
          pedidos.push({
            user_id: p.user_id, submitted_at: p.citizen_id_submitted_at,
            ...contactoDoCidadao(conta?.user ?? null, p.phone),
            front_url: await assinar(p.citizen_id_photo_front_url),
            back_url: await assinar(p.citizen_id_photo_back_url),
            selfie_url: await assinar(p.citizen_selfie_url),
          });
        }
        return resposta({ pending: pedidos });
      }

      const r = validarRevisao(body);
      if (!r.ok) return resposta({ error: r.erro }, 400);
      const { data: antes } = await supabase.from("user_identity").select("citizen_id_status").eq("user_id", r.userId).maybeSingle();
      if (antes?.citizen_id_status !== "PENDING_REVIEW") return resposta({ error: "este pedido nao esta por rever" }, 409);
      const agora = new Date().toISOString();
      const { error } = await supabase.from("user_identity").update({
        citizen_id_verified: r.aprovar, citizen_id_status: r.aprovar ? "VERIFIED" : "REJECTED",
        citizen_id_reviewed_by: callerId, citizen_id_reviewed_at: agora, citizen_id_rejection_reason: r.aprovar ? null : r.motivo,
      }).eq("user_id", r.userId);
      if (error) return resposta({ error: error.message }, 400);
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: r.aprovar ? "citizen_id_verified" : "citizen_id_rejected", entity_type: "user_identity", entity_id: r.userId, before: antes, after: { status: r.aprovar ? "VERIFIED" : "REJECTED", reason: r.motivo } });
      await supabase.from("notifications").insert(r.aprovar
        ? { user_id: r.userId, title: "Identidade verificada ✅", body: "Já podes registar moradas.", entity_type: "user_identity", entity_id: r.userId }
        : { user_id: r.userId, title: "Verificação não aceite", body: "Motivo: " + r.motivo + " — tira as fotos de novo em Conta → Verificação simples.", entity_type: "user_identity", entity_id: r.userId });
      return resposta({ ok: true, status: r.aprovar ? "VERIFIED" : "REJECTED" });
    }

    return resposta({ error: "acao desconhecida" }, 400);
  } catch (e) {
    return resposta({ error: String(e) }, 500);
  }
});
