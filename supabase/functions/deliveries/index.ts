import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Deliveries Service (v17)
// Novo: is_urgent (prioridade) guardada na criacao, e uma acao para a marcar
// depois. Usada pela ordem sugerida para visitar entregas urgentes primeiro.

const TRANSITIONS: Record<string, string[]> = {
  CREATED: ["ASSIGNED", "CANCELLED"], ASSIGNED: ["PICKED_UP", "CANCELLED"], PICKED_UP: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "CANCELLED"], OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"], FAILED: ["ASSIGNED", "CANCELLED"],
  DELIVERED: [], CANCELLED: [],
};
const FAILURE_REASONS = ["morada_nao_encontrada", "destinatario_ausente", "codigo_incorreto", "recusa", "outro"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

async function getZoneRates(supabase: ReturnType<typeof createClient>, zoneCode: string, organizationId?: string | null) {
  const { data: zone } = await supabase.from("pricing_zones").select("*").eq("zone_code", zoneCode).maybeSingle();
  if (!zone) return null;
  let rates = { base_fee: zone.base_fee, routing_fee: zone.routing_fee, proof_fee: zone.proof_fee };
  if (organizationId) {
    const { data: override } = await supabase.from("organization_pricing_overrides").select("*").eq("organization_id", organizationId).eq("zone_code", zoneCode).maybeSingle();
    if (override) {
      if (override.base_fee != null) rates.base_fee = override.base_fee;
      if (override.routing_fee != null) rates.routing_fee = override.routing_fee;
      if (override.proof_fee != null) rates.proof_fee = override.proof_fee;
    }
  }
  return rates;
}

async function isSuperAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("organization_members").select("role").eq("user_id", userId);
  return (data ?? []).some((m) => m.role === "super_admin");
}

async function verificarAssinaturaProva(supabase: ReturnType<typeof createClient>, userId: string, deliveryId: string, proof: any): Promise<boolean | null> {
  if (!proof?.crypto_signature || !proof?.crypto_payload || !proof?.crypto_device_id) return null;
  try {
    const { data: chave } = await supabase.from("signing_keys").select("public_key_jwk").eq("user_id", userId).eq("device_id", proof.crypto_device_id).maybeSingle();
    if (!chave) return false;
    const payloadObj = JSON.parse(proof.crypto_payload);
    if (payloadObj.delivery_id !== deliveryId) return false;
    const publicKey = await crypto.subtle.importKey("jwk", chave.public_key_jwk as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(proof.crypto_signature), (c) => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(proof.crypto_payload);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sigBytes, dataBytes);
  } catch (e) {
    return false;
  }
}

async function ajustarConfiancaPorEntrega(supabase: ReturnType<typeof createClient>, addressId: string, delta: number) {
  const { data: addr } = await supabase.from("addresses").select("confidence_score").eq("id", addressId).maybeSingle();
  if (!addr) return;
  const atual = typeof addr.confidence_score === "number" ? addr.confidence_score : 50;
  const novo = Math.max(0, Math.min(100, atual + delta));
  await supabase.from("addresses").update({ confidence_score: novo }).eq("id", addressId);
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
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "update_status";
    const body = await req.json();

    if (action === "set_urgent") {
      const { delivery_id, is_urgent } = body;
      if (!delivery_id) return new Response(JSON.stringify({ error: "delivery_id e obrigatorio" }), { status: 400, headers: cors });
      const { data: delivery } = await supabase.from("deliveries").select("created_by").eq("id", delivery_id).maybeSingle();
      if (!delivery) return new Response(JSON.stringify({ error: "entrega nao encontrada" }), { status: 404, headers: cors });
      const { data: isAdminRes } = await supabase.rpc("is_admin", { check_user_id: callerId });
      if (delivery.created_by !== callerId && !isAdminRes) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { error } = await supabase.from("deliveries").update({ is_urgent: !!is_urgent }).eq("id", delivery_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true, is_urgent: !!is_urgent }), { headers: cors });
    }

    if (action === "list_org_deliveries") {
      const isSuper = await isSuperAdmin(supabase, callerId);
      let driverIds: string[] = [];

      if (!isSuper) {
        const { data: myMembership } = await supabase.from("organization_members").select("organization_id").eq("user_id", callerId).eq("role", "operador_postal").maybeSingle();
        if (!myMembership) return new Response(JSON.stringify({ error: "apenas Operador Postal ou Super Admin" }), { status: 403, headers: cors });
        const { data: estafetasDaOrg } = await supabase.from("organization_members").select("user_id").eq("organization_id", myMembership.organization_id).eq("role", "estafeta");
        driverIds = (estafetasDaOrg ?? []).map((m) => m.user_id);
        if (driverIds.length === 0) return new Response(JSON.stringify({ deliveries: [] }), { headers: cors });
      }

      let query = supabase.from("deliveries")
        .select("id, tracking_code, status, recipient_name, recipient_phone, instructions, updated_at, assigned_driver, origin_postal_code, origin_plus_code, is_urgent, addresses(reference,plus_code,postal_code,house_number,streets(name),quadras(code))")
        .order("updated_at", { ascending: false }).limit(100);
      if (!isSuper) query = query.in("assigned_driver", driverIds);
      const { data, error } = await query;
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      const results = [];
      for (const d of data ?? []) {
        let driverEmail: string | undefined;
        if (d.assigned_driver) { const { data: u } = await supabase.auth.admin.getUserById(d.assigned_driver); driverEmail = u?.user?.email; }
        results.push({ ...d, driver_email: driverEmail });
      }
      return new Response(JSON.stringify({ deliveries: results }), { headers: cors });
    }

    if (action === "delete_one") {
      if (!(await isSuperAdmin(supabase, callerId))) return new Response(JSON.stringify({ error: "apenas o super admin pode eliminar entregas" }), { status: 403, headers: cors });
      const { delivery_id } = body;
      if (!delivery_id) return new Response(JSON.stringify({ error: "delivery_id e obrigatorio" }), { status: 400, headers: cors });
      const { data: before } = await supabase.from("deliveries").select("tracking_code, status").eq("id", delivery_id).single();
      await supabase.from("usage_events").delete().eq("delivery_id", delivery_id);
      await supabase.from("delivery_proofs").delete().eq("delivery_id", delivery_id);
      await supabase.from("delivery_status_history").delete().eq("delivery_id", delivery_id);
      const { error } = await supabase.from("deliveries").delete().eq("id", delivery_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "delivery_deleted", entity_type: "delivery", entity_id: delivery_id, before, after: null });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "clear_all") {
      if (!(await isSuperAdmin(supabase, callerId))) return new Response(JSON.stringify({ error: "apenas o super admin pode limpar o historico" }), { status: 403, headers: cors });
      const { confirm } = body;
      if (confirm !== "ELIMINAR TUDO") return new Response(JSON.stringify({ error: "confirmacao em falta" }), { status: 400, headers: cors });
      const { count } = await supabase.from("deliveries").select("*", { count: "exact", head: true });
      await supabase.from("usage_events").delete().not("delivery_id", "is", null);
      await supabase.from("delivery_proofs").delete().not("id", "is", null);
      await supabase.from("delivery_status_history").delete().not("id", "is", null);
      const { error } = await supabase.from("deliveries").delete().not("id", "is", null);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "deliveries_history_cleared", entity_type: "delivery", entity_id: callerId, before: { count: count ?? 0 }, after: null });
      return new Response(JSON.stringify({ ok: true, deleted: count ?? 0 }), { headers: cors });
    }

    if (action === "create") {
      const { address_id, recipient_name, recipient_phone, instructions, origin_latitude, origin_longitude, origin_municipality_id, origin_province_id, origin_postal_code, origin_plus_code, zone_code, payer_organization_id, is_urgent } = body;
      if (!address_id || !recipient_name) return new Response(JSON.stringify({ error: "address_id e recipient_name sao obrigatorios" }), { status: 400, headers: cors });
      if (recipient_phone) {
        const digits = recipient_phone.replace(/\D/g, '');
        const local = digits.startsWith('244') ? digits.slice(3) : digits;
        if (local.length > 0 && local.length !== 9) {
          return new Response(JSON.stringify({ error: "CONTACTO_INVALID: o contacto deve ter o formato +244 9xx xxx xxx" }), { status: 422, headers: cors });
        }
      }

      const { data: delivery, error } = await supabase.from("deliveries").insert({
        address_id, recipient_name, recipient_phone: recipient_phone || null, instructions: instructions || null,
        origin_latitude: origin_latitude ?? null, origin_longitude: origin_longitude ?? null,
        origin_municipality_id: origin_municipality_id ?? null, origin_province_id: origin_province_id ?? null,
        origin_postal_code: origin_postal_code ?? null, origin_plus_code: origin_plus_code ?? null,
        zone_code: zone_code ?? null, payer_organization_id: payer_organization_id ?? null,
        is_urgent: !!is_urgent,
        created_by: callerId,
      }).select("*, addresses(latitude,longitude,postal_code,plus_code,reference,house_number,streets(name),quadras(code),status,flagged_for_review)").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("delivery_status_history").insert({ delivery_id: delivery.id, status: "CREATED" });

      if (zone_code) {
        const rates = await getZoneRates(supabase, zone_code, payer_organization_id);
        if (rates) {
          const total = rates.base_fee + rates.routing_fee + rates.proof_fee;
          await supabase.from("usage_events").insert({
            delivery_id: delivery.id, organization_id: payer_organization_id ?? null, event_type: "DELIVERY_ROUTED", zone_code,
            amount_total: total, amount_driver: rates.base_fee, amount_platform: rates.routing_fee + rates.proof_fee,
            is_free_pilot: !payer_organization_id,
            breakdown: { frete: rates.base_fee, roteamento: rates.routing_fee, prova: rates.proof_fee },
          });
        }
      }

      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "delivery_routed", entity_type: "delivery", entity_id: delivery.id, before: null, after: { address_id, zone_code } });
      return new Response(JSON.stringify(delivery), { headers: cors });
    }

    if (action === "assign_driver") {
      const { delivery_id, driver_id } = body;
      const { data: delivery } = await supabase.from("deliveries").select("created_by, status").eq("id", delivery_id).single();
      if (!delivery) return new Response(JSON.stringify({ error: "entrega nao encontrada" }), { status: 404, headers: cors });
      const { data: isAdminRes } = await supabase.rpc("is_admin", { check_user_id: callerId });
      if (delivery.created_by !== callerId && !isAdminRes) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      if (delivery.status !== "CREATED") return new Response(JSON.stringify({ error: "so e possivel atribuir estafeta no estado CREATED" }), { status: 400, headers: cors });
      const { error } = await supabase.from("deliveries").update({ assigned_driver: driver_id, status: "ASSIGNED", updated_at: new Date().toISOString() }).eq("id", delivery_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      await supabase.from("delivery_status_history").insert({ delivery_id, status: "ASSIGNED" });
      return new Response(JSON.stringify({ ok: true, status: "ASSIGNED" }), { headers: cors });
    }

    if (action === "update_status") {
      const { delivery_id, new_status, proof, pin, reason, is_volumoso, is_espera_longa } = body;
      if (!delivery_id || !new_status) return new Response(JSON.stringify({ error: "delivery_id e new_status sao obrigatorios" }), { status: 400, headers: cors });

      const { data: delivery } = await supabase.from("deliveries").select("status, assigned_driver, created_by, address_id, tracking_code, confirmation_pin, confirmation_pin_expires_at, zone_code, payer_organization_id").eq("id", delivery_id).single();
      if (!delivery) return new Response(JSON.stringify({ error: "entrega nao encontrada" }), { status: 404, headers: cors });

      const { data: isAdminRes } = await supabase.rpc("is_admin", { check_user_id: callerId });
      const isDriver = delivery.assigned_driver === callerId;
      const isOwnerCancelling = delivery.created_by === callerId && new_status === "CANCELLED";
      if (!isAdminRes && !isDriver && !isOwnerCancelling) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });

      const allowed = TRANSITIONS[delivery.status] || [];
      if (!allowed.includes(new_status)) return new Response(JSON.stringify({ error: `transicao invalida: ${delivery.status} -> ${new_status}` }), { status: 400, headers: cors });

      if (new_status === "PICKED_UP" && !proof?.photo_url) {
        return new Response(JSON.stringify({ error: "e obrigatoria uma foto como prova de recolha" }), { status: 422, headers: cors });
      }

      if (new_status === "DELIVERED") {
        if (new Date(delivery.confirmation_pin_expires_at) < new Date()) {
          return new Response(JSON.stringify({ error: "PIN_EXPIRED: o PIN desta entrega expirou (72h) - pede ao remetente para gerar um novo" }), { status: 410, headers: cors });
        }
        if (!pin || String(pin) !== String(delivery.confirmation_pin)) {
          return new Response(JSON.stringify({ error: "PIN de confirmacao incorreto" }), { status: 400, headers: cors });
        }
      }
      if (new_status === "FAILED" && !FAILURE_REASONS.includes(reason)) return new Response(JSON.stringify({ error: "motivo da falha e obrigatorio" }), { status: 400, headers: cors });

      const updatePayload: Record<string, unknown> = { status: new_status, updated_at: new Date().toISOString() };
      if (typeof is_volumoso === "boolean") updatePayload.is_volumoso = is_volumoso;
      if (typeof is_espera_longa === "boolean") updatePayload.is_espera_longa = is_espera_longa;
      const { error: updateError } = await supabase.from("deliveries").update(updatePayload).eq("id", delivery_id);
      if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: cors });
      await supabase.from("delivery_status_history").insert({ delivery_id, status: new_status });

      let proofId: string | null = null;
      let cryptoVerified: boolean | null = null;
      if ((new_status === "DELIVERED" || new_status === "FAILED" || new_status === "PICKED_UP") && proof) {
        const proofType = new_status === "PICKED_UP" ? "PICKUP" : new_status === "FAILED" ? "FAILED" : "POD";
        cryptoVerified = await verificarAssinaturaProva(supabase, callerId, delivery_id, proof);
        const proofRow: Record<string, unknown> = {
          delivery_id, proof_type: proofType,
          observation: (new_status === "FAILED" ? `[${reason}] ` : "") + (proof.observation ?? ""),
          photo_url: proof.photo_url ?? null, signature_url: proof.signature_url ?? null, created_by: callerId,
          crypto_signature: proof.crypto_signature ?? null, crypto_payload: proof.crypto_payload ?? null,
          crypto_algorithm: proof.crypto_algorithm ?? null, crypto_device_id: proof.crypto_device_id ?? null,
          crypto_verified: cryptoVerified,
        };
        if (typeof proof.latitude === "number" && typeof proof.longitude === "number") proofRow.location = `SRID=4326;POINT(${proof.longitude} ${proof.latitude})`;
        const { data: proofData } = await supabase.from("delivery_proofs").insert(proofRow).select("id").single();
        proofId = proofData?.id ?? null;
      }

      if (delivery.zone_code && (new_status === "DELIVERED" || new_status === "FAILED")) {
        const rates = await getZoneRates(supabase, delivery.zone_code, delivery.payer_organization_id);
        if (rates) {
          const isFreePilot = !delivery.payer_organization_id;
          if (new_status === "DELIVERED") {
            let extras = 0; const extrasBreakdown: Record<string, number> = {};
            if (is_volumoso) { extras += 500; extrasBreakdown.volumoso = 500; }
            if (is_espera_longa) { extras += 300; extrasBreakdown.espera_longa = 300; }
            let total = rates.base_fee + rates.routing_fee + rates.proof_fee + extras;
            const now = new Date(); const isNightWeekend = now.getHours() >= 20 || now.getHours() < 6 || now.getDay() === 0 || now.getDay() === 6;
            let surcharge = 0; if (isNightWeekend) { surcharge = Math.round(total * 0.2); total += surcharge; }
            await supabase.from("usage_events").insert({
              delivery_id, organization_id: delivery.payer_organization_id, event_type: "DELIVERY_POD", zone_code: delivery.zone_code,
              amount_total: total, amount_driver: rates.base_fee, amount_platform: total - rates.base_fee, is_free_pilot: isFreePilot,
              breakdown: { frete: rates.base_fee, roteamento: rates.routing_fee, prova: rates.proof_fee, ...extrasBreakdown, noturno_fim_de_semana: surcharge || undefined },
            });
          } else {
            const attemptFee = Math.round(rates.base_fee * 0.3);
            await supabase.from("usage_events").insert({
              delivery_id, organization_id: delivery.payer_organization_id, event_type: "DELIVERY_FAILED_ATTEMPT", zone_code: delivery.zone_code,
              amount_total: attemptFee + rates.routing_fee + rates.proof_fee, amount_driver: attemptFee, amount_platform: rates.routing_fee + rates.proof_fee,
              is_free_pilot: isFreePilot, breakdown: { taxa_tentativa_estafeta: attemptFee, roteamento_creditado: rates.routing_fee, prova_creditado: rates.proof_fee, motivo: reason },
            });
          }
        }
      }

      if (new_status === "DELIVERED") {
        await supabase.from("audit_logs").insert({ actor_id: callerId, action: "delivery_delivered_with_pod", entity_type: "delivery", entity_id: delivery_id, before: { status: delivery.status }, after: { status: new_status, has_photo: !!proof?.photo_url, has_signature: !!proof?.signature_url, proof_id: proofId, crypto_verified: cryptoVerified } });
        if (delivery.address_id) await ajustarConfiancaPorEntrega(supabase, delivery.address_id, 2);
      }
      if (new_status === "PICKED_UP") {
        await supabase.from("audit_logs").insert({ actor_id: callerId, action: "delivery_picked_up_with_proof", entity_type: "delivery", entity_id: delivery_id, before: null, after: { has_photo: !!proof?.photo_url, proof_id: proofId, crypto_verified: cryptoVerified } });
      }
      if (new_status === "FAILED" && delivery.address_id) {
        const { data: addr } = await supabase.from("addresses").select("created_by").eq("id", delivery.address_id).single();
        await supabase.from("addresses").update({ flagged_for_review: true }).eq("id", delivery.address_id);
        await supabase.from("audit_logs").insert({ actor_id: callerId, action: "delivery_failed_flagged_address", entity_type: "address", entity_id: delivery.address_id, before: null, after: { reason, delivery_id, tracking_code: delivery.tracking_code } });
        if (reason === "morada_nao_encontrada") await ajustarConfiancaPorEntrega(supabase, delivery.address_id, -15);
        if (addr?.created_by) {
          await supabase.from("notifications").insert({ user_id: addr.created_by, title: "Uma entrega falhou nesta morada", body: "Motivo: " + reason + " (rastreio " + delivery.tracking_code + "). A morada foi marcada para revisão.", entity_type: "address", entity_id: delivery.address_id });
        }
      }
      return new Response(JSON.stringify({ ok: true, status: new_status, crypto_verified: cryptoVerified }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
