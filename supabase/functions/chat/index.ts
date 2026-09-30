import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { BUCKET_CHAT, anexoParaGuardar, nomeNoBucketChat } from "./regras.ts";

// Angola Localiza - Chat Service (v5)
// v5: o bucket chat-media é privado. Os anexos têm de estar na pasta de quem
// envia (chat-media/<id>/…) e quem lê recebe links temporários (1 hora);
// um media_url de fora do Storage do projeto deixa de ser aceite ou mostrado.
// Super admin agora ve os canais de TODAS as organizacoes que existem,
// mesmo que ainda nao tenham ninguem atribuido (acesso total para gestao/
// teste), em vez de so as que ja tem estafetas/tecnicos reais.

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

  async function verificarAcesso(conversationType: string, conversationKey: string): Promise<{ podeLer: boolean; podeEscrever: boolean; podeComunicado: boolean }> {
    const { data: memberships } = await supabase.from("organization_members").select("role, organization_id").eq("user_id", callerId);
    const isSuperAdmin = (memberships ?? []).some((m) => m.role === "super_admin");

    if (conversationType === "DELIVERY") {
      const { data: delivery } = await supabase.from("deliveries").select("created_by, assigned_driver").eq("id", conversationKey).maybeSingle();
      if (!delivery) return { podeLer: false, podeEscrever: false, podeComunicado: false };
      const envolvido = delivery.created_by === callerId || delivery.assigned_driver === callerId;
      return { podeLer: envolvido || isSuperAdmin, podeEscrever: envolvido, podeComunicado: false };
    }

    if (conversationType === "ORG_ESTAFETA" || conversationType === "ORG_CAMPO") {
      if (isSuperAdmin) {
        const { data: orgExiste } = await supabase.from("organizations").select("id").eq("id", conversationKey).maybeSingle();
        if (!orgExiste) return { podeLer: false, podeEscrever: false, podeComunicado: false };
        return { podeLer: true, podeEscrever: true, podeComunicado: true };
      }
      const meuMembro = (memberships ?? []).find((m) => m.organization_id === conversationKey);
      if (!meuMembro) return { podeLer: false, podeEscrever: false, podeComunicado: false };
      const cargosBase = conversationType === "ORG_ESTAFETA" ? ["estafeta"] : ["tecnico_campo"];
      const cargosChefia = conversationType === "ORG_ESTAFETA"
        ? ["operador_postal", "admin_municipal", "admin_provincial", "admin_nacional"]
        : ["supervisor", "admin_municipal", "admin_provincial", "admin_nacional"];
      const meuCargo = meuMembro.role;
      const souBase = cargosBase.includes(meuCargo);
      const souChefia = cargosChefia.includes(meuCargo);
      return { podeLer: souBase || souChefia, podeEscrever: souBase || souChefia, podeComunicado: souChefia };
    }

    return { podeLer: false, podeEscrever: false, podeComunicado: false };
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const body = await req.json();

    if (action === "list") {
      const { conversation_type, conversation_key } = body;
      const acesso = await verificarAcesso(conversation_type, conversation_key);
      if (!acesso.podeLer) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });

      const { data, error } = await supabase.from("chat_messages")
        .select("id, sender_id, body, media_url, media_type, is_announcement, created_at")
        .eq("conversation_type", conversation_type).eq("conversation_key", conversation_key)
        .order("created_at").limit(200);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      const senderIds = [...new Set((data ?? []).map((m) => m.sender_id))];
      const emailMap: Record<string, string> = {};
      for (const id of senderIds) { const { data: u } = await supabase.auth.admin.getUserById(id); if (u?.user?.email) emailMap[id] = u.user.email; }
      const messages = [];
      for (const m of data ?? []) {
        let mediaUrl: string | null = null;
        const nome = m.media_url ? nomeNoBucketChat(m.media_url, supabaseUrl) : null;
        if (nome) {
          const { data: link } = await supabase.storage.from(BUCKET_CHAT).createSignedUrl(nome, 3600);
          mediaUrl = link?.signedUrl ?? null;
        }
        messages.push({ ...m, media_url: mediaUrl, media_type: mediaUrl ? m.media_type : null, sender_email: emailMap[m.sender_id], sou_eu: m.sender_id === callerId });
      }
      return new Response(JSON.stringify({ messages, pode_escrever: acesso.podeEscrever, pode_comunicado: acesso.podeComunicado }), { headers: cors });
    }

    if (action === "send") {
      const { conversation_type, conversation_key, message_body, is_announcement, media_url, media_type } = body;
      const temTexto = message_body && message_body.trim();
      const temMedia = !!media_url;
      if (!conversation_type || !conversation_key || (!temTexto && !temMedia)) {
        return new Response(JSON.stringify({ error: "escreve uma mensagem ou anexa uma foto/video" }), { status: 400, headers: cors });
      }
      if (temMedia && !["image", "video"].includes(media_type)) {
        return new Response(JSON.stringify({ error: "media_type invalido" }), { status: 400, headers: cors });
      }
      let mediaGuardada: string | null = null;
      if (temMedia) {
        const anexo = anexoParaGuardar(media_url, supabaseUrl, callerId);
        if (!anexo.ok) return new Response(JSON.stringify({ error: anexo.erro }), { status: 422, headers: cors });
        mediaGuardada = anexo.texto;
      }
      const acesso = await verificarAcesso(conversation_type, conversation_key);
      if (!acesso.podeEscrever) return new Response(JSON.stringify({ error: "nao autorizado a escrever nesta conversa" }), { status: 403, headers: cors });
      if (is_announcement && !acesso.podeComunicado) return new Response(JSON.stringify({ error: "apenas quem gere o setor pode enviar um comunicado" }), { status: 403, headers: cors });

      const { data, error } = await supabase.from("chat_messages").insert({
        conversation_type, conversation_key, sender_id: callerId,
        body: temTexto ? message_body.trim().slice(0, 2000) : null, is_announcement: !!is_announcement,
        media_url: mediaGuardada, media_type: temMedia ? media_type : null,
      }).select("id, created_at").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      const notifBody = temTexto ? message_body.trim().slice(0, 140) : (media_type === 'video' ? '🎥 Vídeo' : '📷 Foto');

      if (conversation_type === "DELIVERY") {
        const { data: delivery } = await supabase.from("deliveries").select("created_by, assigned_driver, tracking_code").eq("id", conversation_key).single();
        const destinatario = delivery?.created_by === callerId ? delivery?.assigned_driver : delivery?.created_by;
        if (destinatario) {
          await supabase.from("notifications").insert({ user_id: destinatario, title: "Nova mensagem — entrega " + delivery?.tracking_code, body: notifBody, entity_type: "delivery", entity_id: conversation_key });
        }
      }
      if (is_announcement) {
        const cargosBase = conversation_type === "ORG_ESTAFETA" ? ["estafeta"] : ["tecnico_campo"];
        const { data: destinatarios } = await supabase.from("organization_members").select("user_id").eq("organization_id", conversation_key).in("role", cargosBase);
        for (const dest of destinatarios ?? []) {
          await supabase.from("notifications").insert({ user_id: dest.user_id, title: "📢 Comunicado", body: notifBody, entity_type: conversation_type, entity_id: conversation_key });
        }
      }
      return new Response(JSON.stringify({ ok: true, id: data.id, created_at: data.created_at }), { headers: cors });
    }

    if (action === "list_my_channels") {
      const { data: memberships } = await supabase.from("organization_members").select("role, organization_id, organizations(name)").eq("user_id", callerId);
      const isSuperAdmin = (memberships ?? []).some((m) => m.role === "super_admin");
      const canais: { conversation_type: string; conversation_key: string; titulo: string }[] = [];

      if (isSuperAdmin) {
        const { data: todasOrgs } = await supabase.from("organizations").select("id, name").order("name");
        for (const org of todasOrgs ?? []) {
          canais.push({ conversation_type: "ORG_ESTAFETA", conversation_key: org.id, titulo: org.name + " · Estafetas" });
          canais.push({ conversation_type: "ORG_CAMPO", conversation_key: org.id, titulo: org.name + " · Campo" });
        }
        return new Response(JSON.stringify({ canais }), { headers: cors });
      }

      for (const m of memberships ?? []) {
        if (m.role === "estafeta" || m.role === "operador_postal") canais.push({ conversation_type: "ORG_ESTAFETA", conversation_key: m.organization_id, titulo: ((m.organizations as any)?.name || "Organização") + " · Estafetas" });
        if (m.role === "tecnico_campo" || m.role === "supervisor") canais.push({ conversation_type: "ORG_CAMPO", conversation_key: m.organization_id, titulo: ((m.organizations as any)?.name || "Organização") + " · Campo" });
      }
      return new Response(JSON.stringify({ canais }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
