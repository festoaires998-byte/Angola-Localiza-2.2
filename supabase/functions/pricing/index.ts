import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  aplicarDesconto, calcularPreco, codigoPais, escolherZona, tarifasDaLinha, valorTarifa, zonaValida,
  type Territorio,
} from "./precos.ts";

// Angola Localiza - Pricing Service (v5)
// quote: preço de uma entrega (frete da zona + roteamento + prova + extras +
//   sobretaxa noturna/fim de semana na hora do país). A zona vem de zone_code
//   ou zone_code_hint; se não vier, calcula-se pelos municípios/províncias da
//   recolha e do destino (address_id ou *_municipality_id/*_province_id).
//   A tabela negociada de uma organização só se aplica a quem é membro dela.
// admin_update_zone: só super_admin altera as tarifas de um país (fica auditado).
// list_zones: tarifas de todos os países.
// v5 corrige a v4: "zone" fora de alcance (erro 500 em todas as cotações),
// extras sempre recusados, e zone_code obrigatório (a app e o site mandavam
// zone_code_hint). As tarifas vêm só de country_pricing_zones.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const responder = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: cors });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOuNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id ?? null;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "quote";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (action === "quote") {
      const pais = codigoPais(body.country_code);

      let destino: Territorio | null = {
        municipality_id: uuidOuNull(body.destination_municipality_id),
        province_id: uuidOuNull(body.destination_province_id),
      };
      const addressId = uuidOuNull(body.address_id);
      if (addressId && !destino.municipality_id && !destino.province_id) {
        const { data: morada } = await supabase.from("addresses").select("municipality_id, province_id").eq("id", addressId).maybeSingle();
        destino = morada ?? null;
      }
      const origem: Territorio = {
        municipality_id: uuidOuNull(body.origin_municipality_id),
        province_id: uuidOuNull(body.origin_province_id),
      };
      const { zona, estimada } = escolherZona(body, origem, destino);

      const { data: linha } = await supabase.from("country_pricing_zones").select("*").eq("country_code", pais).eq("zone_code", zona).maybeSingle();
      if (!linha) return responder({ error: "pricing_not_configured", country_code: pais, zone_code: zona }, 409);

      // A tabela negociada só vale para quem pertence à organização.
      let organizacao: string | null = null;
      const pedida = uuidOuNull(body.organization_id);
      if (pedida && callerId) {
        const { data: membro } = await supabase.from("organization_members").select("organization_id").eq("organization_id", pedida).eq("user_id", callerId).limit(1);
        if ((membro ?? []).length > 0) organizacao = pedida;
      }
      let tarifas = tarifasDaLinha(linha);
      if (organizacao) {
        const { data: desconto } = await supabase.from("organization_pricing_overrides").select("*").eq("organization_id", organizacao).eq("zone_code", zona).maybeSingle();
        let entregasNoMes = 0;
        if (desconto?.volume_discount_threshold) {
          const inicio = new Date();
          inicio.setUTCDate(1);
          inicio.setUTCHours(0, 0, 0, 0);
          const { count } = await supabase.from("deliveries").select("id", { count: "exact", head: true })
            .eq("payer_organization_id", organizacao).gte("created_at", inicio.toISOString());
          entregasNoMes = count ?? 0;
        }
        tarifas = aplicarDesconto(tarifas, desconto ?? null, entregasNoMes);
      }

      const agora = typeof body.at_time === "string" && !Number.isNaN(Date.parse(body.at_time)) ? new Date(body.at_time) : new Date();
      const preco = calcularPreco(tarifas, { volumoso: !!body.is_volumoso, esperaLonga: !!body.is_espera_longa }, agora, pais);
      if (!preco.ok) return responder({ error: preco.erro, country_code: pais }, 409);

      return responder({
        country_code: pais,
        zone_code: zona,
        zone_estimated: estimada,
        is_free_pilot: !organizacao,
        currency_code: preco.currency_code,
        breakdown: preco.breakdown,
        amount_total: preco.amount_total,
        amount_driver: preco.amount_driver,
        amount_platform: preco.amount_platform,
      });
    }

    if (action === "list_zones") {
      const { data } = await supabase.from("country_pricing_zones").select("*").order("country_code").order("zone_code");
      return responder({ zones: data ?? [] });
    }

    if (action === "admin_update_zone") {
      if (!callerId) return responder({ error: "sessao invalida" }, 401);
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      if (!(memberships ?? []).some((m: { role: string }) => m.role === "super_admin")) {
        return responder({ error: "apenas super_admin pode alterar bandas de preco" }, 403);
      }
      const pais = codigoPais(body.country_code);
      const zona = zonaValida(body.zone_code);
      if (!zona) return responder({ error: "zone_code invalido (A, B ou C)" }, 400);

      const campos: Record<string, number> = {};
      for (const c of ["base_fee", "routing_fee", "proof_fee", "bulky_fee", "long_wait_fee"]) {
        const v = valorTarifa(body[c]);
        if (v === null) return responder({ error: `${c} invalido (numero >= 0)` }, 400);
        if (v !== undefined) campos[c] = v;
      }
      if (Object.keys(campos).length === 0) return responder({ error: "nada para alterar" }, 400);

      const { data: antes } = await supabase.from("country_pricing_zones").select("*").eq("country_code", pais).eq("zone_code", zona).maybeSingle();
      if (!antes) return responder({ error: "pricing_not_configured", country_code: pais, zone_code: zona }, 404);
      const agora = new Date().toISOString();
      const { error } = await supabase.from("country_pricing_zones")
        .update({ ...campos, updated_by: callerId, updated_at: agora })
        .eq("country_code", pais).eq("zone_code", zona);
      if (error) return responder({ error: error.message }, 400);

      // Tabela antiga (só Angola), mantida igual enquanto houver quem a leia.
      if (pais === "AO") {
        const antigos: Record<string, number> = {};
        for (const c of ["base_fee", "routing_fee", "proof_fee"]) if (c in campos) antigos[c] = campos[c];
        if (Object.keys(antigos).length) {
          await supabase.from("pricing_zones").update({ ...antigos, updated_by: callerId, updated_at: agora }).eq("zone_code", zona);
        }
      }

      await supabase.from("audit_logs").insert({
        actor_id: callerId, action: "pricing_zone_updated", entity_type: "pricing_zone", entity_id: null,
        before: antes, after: { country_code: pais, zone_code: zona, ...campos },
      });
      return responder({ ok: true });
    }

    return responder({ error: "acao desconhecida" }, 400);
  } catch (e) {
    return responder({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
