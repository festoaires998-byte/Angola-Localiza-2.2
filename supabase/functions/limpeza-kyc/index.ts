import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { BUCKET, ESTADOS_DECIDIDOS, LOTE, limiteRetencao, nomesDoPedido } from "./regras.ts";

// Angola Localiza - Limpeza das fotos da verificacao simples (v1)
// Chamada uma vez por dia pelo pg_cron (migracao 20261001100000). Apaga do
// bucket kyc-artifacts as fotos do BI (frente e verso) e a selfie de quem teve
// a decisao (aprovado ou recusado) ha mais de 90 dias. Fica so o registo da
// decisao (user_identity, audit_logs) e das consultas (identity_artifact_views).
// So aceita o pedido com o token guardado no Vault (x-limpeza-token).

const cors = { "Content-Type": "application/json" };
const responder = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return responder({ error: "so POST" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = req.headers.get("x-limpeza-token") ?? "";
  const { data: valido } = await supabase.rpc("token_limpeza_kyc_valido", { p_token: token });
  if (valido !== true) return responder({ error: "nao autorizado" }, 401);

  const agora = new Date();
  const { data: linhas, error } = await supabase
    .from("user_identity")
    .select("user_id, citizen_id_status, citizen_id_reviewed_at, citizen_id_photo_front_url, citizen_id_photo_back_url, citizen_selfie_url")
    .in("citizen_id_status", ESTADOS_DECIDIDOS)
    .lt("citizen_id_reviewed_at", limiteRetencao(agora))
    .is("citizen_id_artifacts_purged_at", null)
    .limit(LOTE);
  if (error) return responder({ error: error.message }, 500);

  let apagados = 0;
  const falhas: { user_id: string; erro: string }[] = [];
  for (const l of linhas ?? []) {
    const nomes = nomesDoPedido(l);
    if (nomes.length > 0) {
      const { error: erroStorage } = await supabase.storage.from(BUCKET).remove(nomes);
      if (erroStorage) {
        falhas.push({ user_id: l.user_id, erro: erroStorage.message });
        continue;
      }
    }
    // So limpa a linha se a decisao ainda for a mesma (sem corridas com um novo pedido).
    const { data: mudou } = await supabase
      .from("user_identity")
      .update({
        citizen_id_photo_front_url: null,
        citizen_id_photo_back_url: null,
        citizen_selfie_url: null,
        citizen_id_artifacts_purged_at: agora.toISOString(),
      })
      .eq("user_id", l.user_id)
      .eq("citizen_id_status", l.citizen_id_status)
      .eq("citizen_id_reviewed_at", l.citizen_id_reviewed_at)
      .select("user_id");
    if (!mudou?.length) continue;
    await supabase.from("audit_logs").insert({
      actor_id: null, action: "citizen_id_artifacts_purged", entity_type: "user_identity", entity_id: l.user_id,
      before: { status: l.citizen_id_status, reviewed_at: l.citizen_id_reviewed_at, files: nomes.length },
      after: { purged_at: agora.toISOString() },
    });
    apagados++;
  }
  return responder({ ok: true, apagados, falhas });
});
