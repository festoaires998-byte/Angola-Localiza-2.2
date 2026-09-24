import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { BUCKET, contactoDoCidadao, eRevisaoPropria, estadoPublico, validarAbertura, validarPedido, validarRevisao } from "./regras.ts";

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
//   telefone do cidadao, para o administrador saber quem esta a rever
//   (contas lidas em paralelo, sem links das fotos).
//   - view (novo): links de 10 min para as 3 fotos de UM pedido; cada abertura
//     fica registada em identity_artifact_views (Lei n.o 22/11). Se o registo
//     falhar, as fotos nao sao entregues.
//   - ninguem abre nem decide a propria verificacao;
//   - review so grava se o pedido ainda estiver PENDING_REVIEW (numa so
//     operacao): dois administradores ao mesmo tempo -> o segundo recebe 409.

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

    if (action === "list_pending" || action === "view" || action === "review") {
      const { data: admin } = await supabase.rpc("is_admin", { check_user_id: callerId });
      if (!admin) return resposta({ error: "apenas administradores" }, 403);

      if (action === "list_pending") {
        const { data, error } = await supabase.from("user_identity")
          .select("user_id, phone, citizen_id_submitted_at")
          .eq("citizen_id_status", "PENDING_REVIEW").neq("user_id", callerId)
          .order("citizen_id_submitted_at", { ascending: true }).limit(30);
        if (error) return resposta({ error: error.message }, 400);
        // Email e nome da conta (auth.users, so a service role os le): todos em paralelo.
        const pedidos = await Promise.all((data ?? []).map(async (p) => {
          const { data: conta } = await supabase.auth.admin.getUserById(p.user_id);
          return { user_id: p.user_id, submitted_at: p.citizen_id_submitted_at, ...contactoDoCidadao(conta?.user ?? null, p.phone) };
        }));
        return resposta({ pending: pedidos });
      }

      if (action === "view") {
        const a = validarAbertura(body);
        if (!a.ok) return resposta({ error: a.erro }, 400);
        if (eRevisaoPropria(callerId, a.userId)) return resposta({ error: "nao podes abrir a tua propria verificacao" }, 403);
        const { data: p } = await supabase.from("user_identity")
          .select("citizen_id_status, citizen_id_photo_front_url, citizen_id_photo_back_url, citizen_selfie_url")
          .eq("user_id", a.userId).maybeSingle();
        if (p?.citizen_id_status !== "PENDING_REVIEW") return resposta({ error: "este pedido nao esta por rever" }, 409);
        // Registo legal de quem viu as fotos (Lei n.o 22/11). Sem registo, nao ha fotos.
        const { error: erroVista } = await supabase.from("identity_artifact_views").insert({ citizen_user_id: a.userId, viewed_by: callerId });
        if (erroVista) return resposta({ error: "nao foi possivel registar a consulta das fotos: " + erroVista.message }, 500);
        const nomes = [p.citizen_id_photo_front_url, p.citizen_id_photo_back_url, p.citizen_selfie_url];
        const validos = nomes.filter((n): n is string => typeof n === "string" && n.length > 0);
        // Links temporários (10 min), todos num só pedido ao Storage.
        const { data: assinados } = validos.length ? await supabase.storage.from(BUCKET).createSignedUrls(validos, 600) : { data: [] };
        const link = (nome: string | null) => (nome ? assinados?.find((x) => x.path === nome && !x.error)?.signedUrl ?? null : null);
        return resposta({ front_url: link(nomes[0]), back_url: link(nomes[1]), selfie_url: link(nomes[2]), expires_in: 600 });
      }

      const r = validarRevisao(body);
      if (!r.ok) return resposta({ error: r.erro }, 400);
      if (eRevisaoPropria(callerId, r.userId)) return resposta({ error: "nao podes decidir a tua propria verificacao" }, 403);
      const agora = new Date().toISOString();
      // Só muda se ainda estiver por rever, numa só operação (sem corrida entre administradores).
      const { data: mudadas, error } = await supabase.from("user_identity").update({
        citizen_id_verified: r.aprovar, citizen_id_status: r.aprovar ? "VERIFIED" : "REJECTED",
        citizen_id_reviewed_by: callerId, citizen_id_reviewed_at: agora, citizen_id_rejection_reason: r.aprovar ? null : r.motivo,
      }).eq("user_id", r.userId).eq("citizen_id_status", "PENDING_REVIEW").select("user_id");
      if (error) return resposta({ error: error.message }, 400);
      if (!mudadas || mudadas.length === 0) return resposta({ error: "este pedido nao esta por rever (talvez outro administrador ja o tenha decidido)" }, 409);
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: r.aprovar ? "citizen_id_verified" : "citizen_id_rejected", entity_type: "user_identity", entity_id: r.userId, before: { status: "PENDING_REVIEW" }, after: { status: r.aprovar ? "VERIFIED" : "REJECTED", reason: r.motivo } });
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
