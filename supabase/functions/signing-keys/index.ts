import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decidirRegisto, deviceIdValido, jwkPublicaValida } from "./regras.ts";

// Angola Localiza - Signing Keys Service (v5)
// Regista a chave publica de um aparelho para que as assinaturas digitais das
// provas de entrega possam depois ser verificadas a serio.
// v5:
// - so aceita uma chave publica P-256 valida (nunca a privada);
// - cada registo novo e cada troca de chave ficam em audit_logs, com a chave
//   anterior, para a prova ter valor juridico;
// - um aparelho com a chave revogada (signing_keys.revoked_at) nao regista
//   outra sozinho (403 SIGNING_KEY_REVOKED).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const responder = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return responder({ error: "sessao invalida - inicia sessao novamente" }, 401);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "register";
    const body = await req.json().catch(() => ({}));

    if (action === "register") {
      const { device_id, public_key_jwk } = body ?? {};
      if (!deviceIdValido(device_id) || !public_key_jwk) return responder({ error: "device_id e public_key_jwk sao obrigatorios" }, 400);
      const jwk = jwkPublicaValida(public_key_jwk);
      if (!jwk) return responder({ error: "public_key_jwk invalida: tem de ser uma chave publica EC P-256" }, 422);

      const { data: existente, error: erroLeitura } = await supabase
        .from("signing_keys")
        .select("id, public_key_jwk, revoked_at")
        .eq("user_id", callerId)
        .eq("device_id", device_id)
        .maybeSingle();
      if (erroLeitura) return responder({ error: erroLeitura.message }, 500);

      const decisao = decidirRegisto(existente, jwk);
      if (decisao.tipo === "igual") return responder({ ok: true });
      if (decisao.tipo === "revogada") {
        return responder({ error: "SIGNING_KEY_REVOKED: a chave deste aparelho foi revogada; fala com o administrador" }, 403);
      }

      if (decisao.tipo === "nova") {
        const { data: criada, error } = await supabase
          .from("signing_keys")
          .insert({ user_id: callerId, device_id, public_key_jwk: jwk })
          .select("id")
          .single();
        if (error || !criada) return responder({ error: error?.message ?? "nao foi possivel registar a chave" }, 400);
        await supabase.from("audit_logs").insert({
          actor_id: callerId, action: "signing_key_registered", entity_type: "signing_key", entity_id: criada.id,
          before: null, after: { device_id, public_key_jwk: jwk },
        });
        return responder({ ok: true });
      }

      // Troca: só se a chave não tiver sido revogada entretanto.
      const { data: trocada, error } = await supabase
        .from("signing_keys")
        .update({ public_key_jwk: jwk })
        .eq("id", existente!.id)
        .is("revoked_at", null)
        .select("id");
      if (error) return responder({ error: error.message }, 400);
      if (!trocada?.length) return responder({ error: "SIGNING_KEY_REVOKED: a chave deste aparelho foi revogada; fala com o administrador" }, 403);
      await supabase.from("audit_logs").insert({
        actor_id: callerId, action: "signing_key_replaced", entity_type: "signing_key", entity_id: existente!.id,
        before: { device_id, public_key_jwk: existente!.public_key_jwk }, after: { device_id, public_key_jwk: jwk },
      });
      return responder({ ok: true, replaced: true });
    }

    if (action === "status") {
      const { device_id } = body ?? {};
      const { data } = await supabase.from("signing_keys").select("device_id, revoked_at").eq("user_id", callerId).eq("device_id", device_id).maybeSingle();
      return responder({ registered: !!data && !data.revoked_at, revoked: !!data?.revoked_at });
    }

    return responder({ error: "acao desconhecida" }, 400);
  } catch (e) {
    return responder({ error: String(e) }, 500);
  }
});
