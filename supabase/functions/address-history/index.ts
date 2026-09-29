import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Address History Service (v2)
// Agora devolve tambem a faixa de confianca, com os mesmos nomes usados na
// API publica - para nunca haver dois nomes diferentes para a mesma coisa.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function bandaDeConfianca(score: number | null | undefined): string {
  if (score == null) return "Nao calculado";
  if (score >= 90) return "Confirmado por entregas reais";
  if (score >= 75) return "Verificado em campo";
  if (score >= 55) return "Registado por cidadao, revisto";
  if (score >= 30) return "Coordenada automatica, por confirmar";
  return "Nao confirmado";
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
  if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });

  try {
    const { data: canValidate } = await supabase.rpc("can_validate_field", { check_user_id: callerId });
    const { data: isAdminRes } = await supabase.rpc("is_admin", { check_user_id: callerId });
    if (!canValidate && !isAdminRes) return new Response(JSON.stringify({ error: "apenas supervisores/admins" }), { status: 403, headers: cors });

    const body = await req.json();
    const { postal_code } = body;
    if (!postal_code) return new Response(JSON.stringify({ error: "postal_code e obrigatorio" }), { status: 400, headers: cors });

    const { data: addr } = await supabase.from("addresses")
      .select("id, postal_code, plus_code, house_number, status, confidence_score, accuracy_meters, created_at, validated_at, created_by, validated_by, reference")
      .eq("postal_code", postal_code.trim().toUpperCase()).maybeSingle();
    if (!addr) return new Response(JSON.stringify({ error: "Nao encontrei nenhuma morada com esse codigo postal." }), { status: 404, headers: cors });

    let criadorEmail: string | undefined; let validadorEmail: string | undefined;
    if (addr.created_by) { const { data: u } = await supabase.auth.admin.getUserById(addr.created_by); criadorEmail = u?.user?.email; }
    if (addr.validated_by) { const { data: u2 } = await supabase.auth.admin.getUserById(addr.validated_by); validadorEmail = u2?.user?.email; }

    const { data: logsAddress } = await supabase.from("audit_logs").select("action, actor_id, created_at, before, after").eq("entity_type", "address").eq("entity_id", addr.id);

    const { data: fieldRecords } = await supabase.from("field_records").select("id").eq("resulting_address_id", addr.id);
    const fieldRecordIds = (fieldRecords ?? []).map((r) => r.id);
    let logsFieldRecord: any[] = [];
    if (fieldRecordIds.length > 0) {
      const { data } = await supabase.from("audit_logs").select("action, actor_id, created_at, before, after").eq("entity_type", "field_record").in("entity_id", fieldRecordIds);
      logsFieldRecord = data ?? [];
    }

    const todosLogs = [...(logsAddress ?? []), ...logsFieldRecord].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const actorIds = [...new Set(todosLogs.map((l) => l.actor_id).filter(Boolean))];
    const emailPorAtor: Record<string, string> = {};
    for (const id of actorIds) { const { data: u } = await supabase.auth.admin.getUserById(id); if (u?.user?.email) emailPorAtor[id] = u.user.email; }
    const historico = todosLogs.map((l) => ({ ...l, actor_email: emailPorAtor[l.actor_id] }));

    return new Response(JSON.stringify({
      address: { ...addr, created_by_email: criadorEmail, validated_by_email: validadorEmail, confidence_band: bandaDeConfianca(addr.confidence_score) },
      historico,
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
