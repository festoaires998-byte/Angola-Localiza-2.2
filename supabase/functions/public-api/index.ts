import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Public API Gateway (v6)
// address/search agora tambem aceita place_kind (categoria: Farmacia, Loja,
// Hospital, etc.) - reaproveitando o prefixo "[Categoria] " ja guardado na
// referencia de cada morada desde o registo, sem precisar de tabela nova.

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
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

function publicShape(a: any) {
  return {
    postal_code: a.postal_code, plus_code: a.plus_code,
    latitude: a.latitude, longitude: a.longitude, status: a.status,
    province_id: a.province_id, municipality_id: a.municipality_id,
    commune_id: a.commune_id, neighborhood_id: a.neighborhood_id,
    street_id: a.street_id, house_number: a.house_number,
    reference: a.reference,
    confidence_score: a.confidence_score ?? null,
    confidence_band: bandaDeConfianca(a.confidence_score),
  };
}

const STATUS_PERMITIDOS = ["PUBLISHED", "APPROVED", "OFFICIAL"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return new Response(JSON.stringify({ error: "cabecalho x-api-key em falta" }), { status: 401, headers: cors });
    const keyHash = await sha256(apiKey);
    const { data: keyRow } = await supabase.from("api_keys").select("*").eq("key_hash", keyHash).single();
    if (!keyRow || keyRow.revoked) return new Response(JSON.stringify({ error: "chave invalida ou revogada" }), { status: 401, headers: cors });

    const now = new Date();
    const windowStart = new Date(keyRow.window_started_at);
    const windowExpired = now.getTime() - windowStart.getTime() > 60000;
    let requestsThisWindow = keyRow.requests_this_window;

    if (windowExpired) {
      requestsThisWindow = 1;
      await supabase.from("api_keys").update({ requests_this_window: 1, window_started_at: now.toISOString(), last_used_at: now.toISOString() }).eq("id", keyRow.id);
    } else {
      if (requestsThisWindow >= keyRow.rate_limit_per_minute) {
        return new Response(JSON.stringify({ error: "limite de pedidos por minuto atingido" }), { status: 429, headers: cors });
      }
      requestsThisWindow += 1;
      await supabase.from("api_keys").update({ requests_this_window: requestsThisWindow, last_used_at: now.toISOString() }).eq("id", keyRow.id);
    }

    const url = new URL(req.url);
    const pathname = url.pathname;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (req.method === "POST" && pathname.endsWith("/v1/address/verify")) {
      const { postal_code, plus_code, latitude, longitude } = body;
      let query = supabase.from("addresses").select("*").in("status", STATUS_PERMITIDOS);
      if (postal_code) query = query.eq("postal_code", String(postal_code).toUpperCase());
      else if (plus_code) query = query.eq("plus_code", String(plus_code).toUpperCase());
      else if (typeof latitude === "number" && typeof longitude === "number") {
        const { data: nearby } = await supabase.rpc("nearby_for_duplicates", { in_lat: latitude, in_lng: longitude, radius_meters: 15 });
        const match = (nearby ?? []).find((n: any) => n.source === "address");
        if (!match) return new Response(JSON.stringify({ valid: false, address: null }), { headers: cors });
        const { data: addr } = await supabase.from("addresses").select("*").eq("id", match.id).maybeSingle();
        return new Response(JSON.stringify({ valid: !!addr, address: addr ? publicShape(addr) : null }), { headers: cors });
      } else {
        return new Response(JSON.stringify({ error: "fornece postal_code, plus_code, ou latitude+longitude" }), { status: 400, headers: cors });
      }
      const { data: addr } = await query.maybeSingle();
      return new Response(JSON.stringify({ valid: !!addr, address: addr ? publicShape(addr) : null }), { headers: cors });
    }

    if (req.method === "POST" && pathname.endsWith("/v1/address/reverse")) {
      const { latitude, longitude } = body;
      if (typeof latitude !== "number" || typeof longitude !== "number") return new Response(JSON.stringify({ error: "latitude e longitude sao obrigatorios" }), { status: 400, headers: cors });
      const { data: nearby } = await supabase.rpc("nearby_for_duplicates", { in_lat: latitude, in_lng: longitude, radius_meters: 30 });
      const match = (nearby ?? []).find((n: any) => n.source === "address");
      if (!match) return new Response(JSON.stringify({ found: false, address: null }), { headers: cors });
      const { data: addr } = await supabase.from("addresses").select("*").eq("id", match.id).in("status", STATUS_PERMITIDOS).maybeSingle();
      return new Response(JSON.stringify({ found: !!addr, address: addr ? publicShape(addr) : null }), { headers: cors });
    }

    // ---- address/search: por rua (parcial) e/ou por categoria de local ----
    if (req.method === "POST" && pathname.endsWith("/v1/address/search")) {
      const { street_name, place_kind, limit } = body;
      if (!street_name && !place_kind) return new Response(JSON.stringify({ error: "fornece street_name e/ou place_kind" }), { status: 400, headers: cors });
      const lim = Math.min(Math.max(parseInt(limit) || 10, 1), 30);

      let query = supabase.from("addresses").select("*").in("status", STATUS_PERMITIDOS);
      if (place_kind) query = query.ilike("reference", "[" + String(place_kind).trim() + "]%");

      if (street_name && String(street_name).trim().length >= 3) {
        const { data: ruas } = await supabase.from("streets").select("id").ilike("nome_normalizado", "%" + String(street_name).trim().toLowerCase() + "%").limit(20);
        if (!ruas || ruas.length === 0) return new Response(JSON.stringify({ results: [] }), { headers: cors });
        query = query.in("street_id", ruas.map((r) => r.id));
      }

      const { data: addrs } = await query.limit(lim);
      return new Response(JSON.stringify({ results: (addrs ?? []).map(publicShape) }), { headers: cors });
    }

    if (req.method === "POST" && pathname.endsWith("/v1/delivery/create")) {
      const { postal_code, recipient_name, recipient_phone, instructions } = body;
      if (!postal_code || !recipient_name) return new Response(JSON.stringify({ error: "postal_code e recipient_name sao obrigatorios" }), { status: 400, headers: cors });
      const { data: addr } = await supabase.from("addresses").select("id").eq("postal_code", String(postal_code).toUpperCase()).in("status", STATUS_PERMITIDOS).maybeSingle();
      if (!addr) return new Response(JSON.stringify({ error: "morada nao encontrada ou nao validada" }), { status: 404, headers: cors });
      const { data: delivery, error } = await supabase.from("deliveries").insert({
        address_id: addr.id, recipient_name, recipient_phone: recipient_phone ?? null, instructions: instructions ?? null,
        payer_organization_id: keyRow.organization_id, created_by: null,
      }).select("id, tracking_code, status").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      await supabase.from("delivery_status_history").insert({ delivery_id: delivery.id, status: "CREATED" });
      await supabase.from("audit_logs").insert({ actor_id: null, action: "delivery_created_via_api", entity_type: "delivery", entity_id: delivery.id, before: null, after: { organization_id: keyRow.organization_id, postal_code } });
      return new Response(JSON.stringify({ ok: true, delivery_id: delivery.id, tracking_code: delivery.tracking_code, status: delivery.status }), { headers: cors });
    }

    const deliveryMatch = pathname.match(/\/v1\/delivery\/([^/]+)$/);
    if (req.method === "GET" && deliveryMatch) {
      const trackingCode = decodeURIComponent(deliveryMatch[1]);
      const { data: delivery } = await supabase.from("deliveries").select("tracking_code, status, recipient_name, updated_at, payer_organization_id").eq("tracking_code", trackingCode).maybeSingle();
      if (!delivery) return new Response(JSON.stringify({ found: false }), { headers: cors });
      if (delivery.payer_organization_id && delivery.payer_organization_id !== keyRow.organization_id) {
        return new Response(JSON.stringify({ error: "esta entrega nao pertence a tua organizacao" }), { status: 403, headers: cors });
      }
      return new Response(JSON.stringify({ found: true, delivery: { tracking_code: delivery.tracking_code, status: delivery.status, recipient_name: delivery.recipient_name, updated_at: delivery.updated_at } }), { headers: cors });
    }

    const getMatch = pathname.match(/\/v1\/address\/([^/]+)$/);
    if (req.method === "GET" && getMatch && getMatch[1] !== "verify" && getMatch[1] !== "reverse" && getMatch[1] !== "search") {
      const postalCode = decodeURIComponent(getMatch[1]);
      const { data: addr } = await supabase.from("addresses").select("*").eq("postal_code", postalCode.toUpperCase()).in("status", STATUS_PERMITIDOS).maybeSingle();
      return new Response(JSON.stringify({ found: !!addr, address: addr ? publicShape(addr) : null }), { headers: cors });
    }

    const action = url.searchParams.get("action") || "get_address";
    if (action === "get_address") {
      const postalCode = body.postal_code || url.searchParams.get("postal_code");
      if (!postalCode) return new Response(JSON.stringify({ error: "postal_code em falta" }), { status: 400, headers: cors });
      const { data } = await supabase.from("addresses").select("*").eq("postal_code", postalCode.toUpperCase()).in("status", STATUS_PERMITIDOS).maybeSingle();
      return new Response(JSON.stringify({ found: !!data, address: data ? publicShape(data) : null }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "rota desconhecida" }), { status: 404, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
