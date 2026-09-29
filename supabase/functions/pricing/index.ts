import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Pricing Service (Fase 1 do modelo de negocio)
// quote: calcula o preco (frete da zona + roteamento + prova + extras),
// respeitando a tabela negociada da organizacao pagadora se existir.
// admin_update_zone: so super_admin pode alterar as bandas por país (fica auditado).

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

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "quote";
    const body = await req.json();

    async function getRates(countryCode: string, zoneCode: string, organizationId?: string | null) {
      const { data: zone } = await supabase.from("country_pricing_zones").select("*").eq("country_code", countryCode).eq("zone_code", zoneCode).single();
      if (!zone) return null;
      let rates = { base_fee: zone.base_fee, routing_fee: zone.routing_fee, proof_fee: zone.proof_fee };
      if (organizationId) {
        const { data: override } = await supabase.from("organization_pricing_overrides").select("*")
          .eq("organization_id", organizationId).eq("zone_code", zoneCode).maybeSingle();
        if (override) {
          if (override.volume_discount_threshold && override.volume_discount_routing_fee) {
            const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
            const { count } = await supabase.from("deliveries").select("*", { count: "exact", head: true })
              .eq("payer_organization_id", organizationId).gte("created_at", monthStart.toISOString());
            if ((count ?? 0) >= override.volume_discount_threshold) rates.routing_fee = override.volume_discount_routing_fee;
          }
          if (override.base_fee != null) rates.base_fee = override.base_fee;
          if (override.routing_fee != null && !(override.volume_discount_threshold)) rates.routing_fee = override.routing_fee;
          if (override.proof_fee != null) rates.proof_fee = override.proof_fee;
        }
      }
      return rates;
    }

    if (action === "quote") {
      const { country_code, zone_code, organization_id, is_volumoso, is_espera_longa, at_time } = body;
      if (!country_code || !zone_code) return new Response(JSON.stringify({ error: "zone_code e obrigatorio" }), { status: 400, headers: cors });

      const rates = await getRates(country_code, zone_code, organization_id);
      if (!rates) return new Response(JSON.stringify({ error: "pricing_not_configured", country_code, zone_code }), { status: 409, headers: cors });

      let extras = 0;
      const extrasBreakdown: Record<string, number> = {};
      if (is_volumoso) { if (rates.bulky_fee == null) return new Response(JSON.stringify({ error: "bulky_fee_not_configured", country_code }), { status: 409, headers: cors }); extras += rates.bulky_fee; extrasBreakdown.volumoso = rates.bulky_fee; }
      if (is_espera_longa) { if (rates.long_wait_fee == null) return new Response(JSON.stringify({ error: "long_wait_fee_not_configured", country_code }), { status: 409, headers: cors }); extras += rates.long_wait_fee; extrasBreakdown.espera_longa = rates.long_wait_fee; }

      let subtotal = rates.base_fee + rates.routing_fee + rates.proof_fee + extras;
      const checkTime = at_time ? new Date(at_time) : new Date();
      const hour = checkTime.getHours();
      const day = checkTime.getDay();
      const isNightOrWeekend = hour >= 20 || hour < 6 || day === 0 || day === 6;
      let nightWeekendSurcharge = 0;
      if (isNightOrWeekend) { nightWeekendSurcharge = Math.round(subtotal * 0.2); subtotal += nightWeekendSurcharge; }

      const amountDriver = rates.base_fee;
      const amountPlatform = subtotal - amountDriver;

      return new Response(JSON.stringify({
        country_code, currency_code: zone.currency_code, zone_code, is_free_pilot: !organization_id,
        breakdown: { frete: rates.base_fee, roteamento: rates.routing_fee, prova: rates.proof_fee, ...extrasBreakdown, noturno_fim_de_semana: nightWeekendSurcharge || undefined },
        amount_total: subtotal, amount_driver: amountDriver, amount_platform: amountPlatform,
      }), { headers: cors });
    }

    if (action === "admin_update_zone") {
      if (!callerId) return new Response(JSON.stringify({ error: "sessao invalida" }), { status: 401, headers: cors });
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      const isSuperAdmin = (memberships ?? []).some((m) => m.role === "super_admin");
      if (!isSuperAdmin) return new Response(JSON.stringify({ error: "apenas super_admin pode alterar bandas de preco" }), { status: 403, headers: cors });

      const { country_code, zone_code, base_fee, routing_fee, proof_fee, bulky_fee, long_wait_fee } = body;
      const { data: before } = await supabase.from("country_pricing_zones").select("*").eq("country_code", country_code).eq("zone_code", zone_code).single();
      const { error } = await supabase.from("country_pricing_zones").update({
        base_fee, routing_fee, proof_fee, bulky_fee, long_wait_fee, updated_by: callerId, updated_at: new Date().toISOString(),
      }).eq("country_code", country_code).eq("zone_code", zone_code);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("audit_logs").insert({
        actor_id: callerId, action: "pricing_zone_updated", entity_type: "pricing_zone", entity_id: null,
        before, after: { country_code, zone_code, base_fee, routing_fee, proof_fee, bulky_fee, long_wait_fee },
      });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "list_zones") {
      const { data } = await supabase.from("country_pricing_zones").select("*").order("country_code").order("zone_code");
      return new Response(JSON.stringify({ zones: data }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
