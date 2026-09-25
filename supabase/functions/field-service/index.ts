import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { codigoBase } from "./codigoPostal.ts";
import { encode as plusCode } from "./plusCode.ts";

// Angola Localiza - Field Service (v21, PRONPET v5.22)
// v21: a aprovação e a fusão passam a gravar o plus_code da morada (10 dígitos,
// como os já existentes), com plusCode.ts = cópia exata do módulo da app.
// v20: o código postal da aprovação passa a usar o esquema 2 (codigoPostal.ts,
// o mesmo módulo da generate-postal-code e da app). Antes usava uma cópia do
// esquema 1 (grelha de 31 símbolos) que dava "undefined" dentro do código
// quando a grelha tinha o valor 31. O resto da função não mudou.
// Novo (v19): confidence_score, accuracy_meters e validated_at passam a ser
// preenchidos a serio na aprovacao/fusao - as colunas ja existiam desde o
// inicio do projeto mas nunca tinham sido ligadas ao codigo que cria a
// morada final. Criterios do confidence_score (0-100, comeca em 100):
//   -20 se a precisao do GPS exigiu justificacao manual (>15m)
//   -5  se a precisao ficou entre 5 e 15m (nao e mau, so nao e excelente)
//   -25 se a marca de agua nao confere com a localizacao
//   -10 se a marca de agua nao foi possivel verificar automaticamente
//   -10 se foi o proprio cidadao a submeter (sem KYC completo, ao contrario do staff)
//   -10 se foi aprovada apesar de um aviso de duplicado proximo
//   -5  se o numero de porta e um sufixo (porta intercalada), nao a sequencia normal

/** Os Plus Codes guardados em addresses têm 10 dígitos (ex.: "5FVQ5PWV+PJ"), como o site. */
const PLUS_CODE_DIGITOS = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Igual à generate-postal-code: AO-{PROV}-{GRID8}[-{N}]-{CHK}, com N (2+) só se o código já existir.
async function generatePostalCode(supabase: ReturnType<typeof createClient>, lat: number, lng: number, provinceName?: string) {
  const { base, checksum: chk } = codigoBase(lat, lng, provinceName);
  let candidate = `AO-${base}-${chk}`; let n = 1;
  while (true) { const { data } = await supabase.from("addresses").select("id").eq("postal_code", candidate).maybeSingle(); if (!data) break; n++; candidate = `AO-${base}-${n}-${chk}`; if (n > 20) break; }
  return candidate;
}
function quadraCode(lat: number, lng: number): string { return `Q${Math.floor(lat / 0.001082)}-${Math.floor(lng / 0.001096)}`; }
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nextFreeSuffix(base: string, takenSuffixes: Set<string>): string {
  for (let i = 0; i < 26; i++) { const letter = String.fromCharCode(65 + i); if (!takenSuffixes.has(letter)) return base + letter; }
  return base + "Z9";
}
async function getOrCreateQuadra(supabase: ReturnType<typeof createClient>, lat: number, lng: number) {
  const code = quadraCode(lat, lng);
  const { data: existing } = await supabase.from("quadras").select("id").eq("code", code).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase.from("quadras").insert({ code, kind: "GRID", area_m2: 14400 }).select("id").single();
  if (created?.id) return created.id;
  // Outra requisição pode ter criado a mesma quadra entre o SELECT e o INSERT.
  const { data: raced } = await supabase.from("quadras").select("id").eq("code", code).maybeSingle();
  return raced?.id ?? null;
}
async function getOrCreateStreet(supabase: ReturnType<typeof createClient>, quadraId: string, streetName: string | null, newUnnamed: boolean) {
  if (newUnnamed || !streetName || !streetName.trim()) {
    const { count } = await supabase.from("streets").select("*", { count: "exact", head: true }).eq("quadra_id", quadraId).ilike("name", "Rua S/N% %");
    const n = (count ?? 0) + 1; const name = `Rua S/Nº ${n}`;
    const normalized = name.toLowerCase();
    const { data: created } = await supabase.from("streets").insert({ name, nome_normalizado: normalized, quadra_id: quadraId, next_seq: 1 }).select("id").single();
    if (created?.id) return created.id;
    // Concorrência: se outra submissão ganhou o mesmo nome, reutilizar a rua.
    const { data: raced } = await supabase.from("streets").select("id").eq("quadra_id", quadraId).eq("nome_normalizado", normalized).maybeSingle();
    return raced?.id ?? null;
  }
  const norm = streetName.trim().toLowerCase();
  const { data: existing } = await supabase.from("streets").select("id").eq("quadra_id", quadraId).eq("nome_normalizado", norm).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase.from("streets").insert({ name: streetName.trim(), nome_normalizado: norm, quadra_id: quadraId, next_seq: 1 }).select("id").single();
  if (created?.id) return created.id;
  // Concorrência: o índice único (nome_normalizado, quadra_id) define o vencedor.
  const { data: raced } = await supabase.from("streets").select("id").eq("quadra_id", quadraId).eq("nome_normalizado", norm).maybeSingle();
  return raced?.id ?? null;
}
async function assignHouseNumber(supabase: ReturnType<typeof createClient>, streetId: string, lat: number, lng: number, infillBase: string | null): Promise<{ number: string; origin: string } | { error: string }> {
  const { data: street } = await supabase.from("streets").select("*").eq("id", streetId).single();
  if (!street) return { error: "rua nao encontrada" };
  if (infillBase) {
    const { data: taken } = await supabase.from("addresses").select("house_number").eq("street_id", streetId);
    const usedLetters = new Set((taken ?? []).filter((a) => a.house_number?.startsWith(infillBase) && a.house_number !== infillBase).map((a) => a.house_number.slice(infillBase.length)));
    return { number: nextFreeSuffix(infillBase, usedLetters), origin: "SUFIXO" };
  }
  if (street.numbering_mode === "FECHADO") return { error: "STREET_CLOSED" };
  if (street.numbering_mode === "METRICO") {
    if (street.origin_lat == null || street.origin_lng == null) return { error: "ORIGIN_MISSING" };
    const num = Math.max(1, Math.round(haversineMeters(street.origin_lat, street.origin_lng, lat, lng) / 10));
    const { data: collision } = await supabase.from("addresses").select("id").eq("street_id", streetId).eq("house_number", String(num)).maybeSingle();
    if (collision) {
      const { data: taken } = await supabase.from("addresses").select("house_number").eq("street_id", streetId);
      const usedLetters = new Set((taken ?? []).filter((a) => a.house_number?.startsWith(String(num)) && a.house_number !== String(num)).map((a) => a.house_number.slice(String(num).length)));
      return { number: nextFreeSuffix(String(num), usedLetters), origin: "SUFIXO" };
    }
    return { number: String(num), origin: "METRICO" };
  }
  const { data: seq } = await supabase.rpc("get_next_house_number_for_street", { p_street_id: streetId });
  return { number: String(seq), origin: "AUTO" };
}
async function previewHouseNumber(supabase: ReturnType<typeof createClient>, streetId: string | null, lat: number, lng: number, infillBase: string | null): Promise<string | null> {
  if (!streetId) return null;
  const { data: street } = await supabase.from("streets").select("*").eq("id", streetId).maybeSingle();
  if (!street) return null;
  if (infillBase) {
    const { data: taken } = await supabase.from("addresses").select("house_number").eq("street_id", streetId);
    const usedLetters = new Set((taken ?? []).filter((a) => a.house_number?.startsWith(infillBase) && a.house_number !== infillBase).map((a) => a.house_number.slice(infillBase.length)));
    return nextFreeSuffix(infillBase, usedLetters);
  }
  if (street.numbering_mode === "FECHADO") return null;
  if (street.numbering_mode === "METRICO") {
    if (street.origin_lat == null || street.origin_lng == null) return null;
    const num = Math.max(1, Math.round(haversineMeters(street.origin_lat, street.origin_lng, lat, lng) / 10));
    const { data: collision } = await supabase.from("addresses").select("id").eq("street_id", streetId).eq("house_number", String(num)).maybeSingle();
    if (!collision) return String(num);
    const { data: taken } = await supabase.from("addresses").select("house_number").eq("street_id", streetId);
    const usedLetters = new Set((taken ?? []).filter((a) => a.house_number?.startsWith(String(num)) && a.house_number !== String(num)).map((a) => a.house_number.slice(String(num).length)));
    return nextFreeSuffix(String(num), usedLetters);
  }
  return String(street.next_seq);
}
function calcularConfianca(record: any, submittedByRole: string, numberOrigin: string): number {
  let pontos = 100;
  if (typeof record.accuracy_meters === "number") {
    if (record.accuracy_meters > 15) pontos -= 20;
    else if (record.accuracy_meters > 5) pontos -= 5;
  }
  if (record.watermark_match === false) pontos -= 25;
  else if (record.watermark_match === null || record.watermark_match === undefined) pontos -= 10;
  if (submittedByRole === "cidadao") pontos -= 10;
  if (record.duplicate_override_reason) pontos -= 10;
  if (numberOrigin === "SUFIXO") pontos -= 5;
  return Math.max(0, Math.min(100, pontos));
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

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "submit";

  if (action === "submit") {
    const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
    if (memberships && memberships.length > 0) {
      const { data: verified } = await supabase.rpc("is_id_verified", { check_user_id: callerId });
      if (!verified) return new Response(JSON.stringify({ error: "ID_NOT_VERIFIED: verifica a tua identidade primeiro (Definições → Verificação de identidade)" }), { status: 403, headers: cors });
    } else {
      const { data: identity } = await supabase.from("user_identity").select("citizen_id_verified").eq("user_id", callerId).maybeSingle();
      if (!identity?.citizen_id_verified) return new Response(JSON.stringify({ error: "CITIZEN_ID_NOT_VERIFIED: verifica a tua identidade primeiro (Definições → Verificação simples)" }), { status: 403, headers: cors });
    }
  } else if (["validate", "set_street_mode", "close_quadra"].includes(action)) {
    const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
    if (memberships && memberships.length > 0) {
      const { data: verified } = await supabase.rpc("is_id_verified", { check_user_id: callerId });
      if (!verified) return new Response(JSON.stringify({ error: "ID_NOT_VERIFIED: verifica a tua identidade primeiro (Definições → Verificação de identidade)" }), { status: 403, headers: cors });
    }
  }

  try {
    const body = await req.json();

    if (action === "list_flagged_for_reverify") {
      const { data: memberships } = await supabase.from("organization_members").select("role").eq("user_id", callerId);
      const allowed = (memberships ?? []).some((m) => ["tecnico_campo", "supervisor", "super_admin", "admin_nacional", "admin_provincial", "admin_municipal"].includes(m.role));
      if (!allowed) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { data: addrs } = await supabase.from("addresses").select("id, postal_code, plus_code, latitude, longitude, reference").eq("flagged_for_review", true).limit(30);
      const results = [];
      for (const a of addrs ?? []) {
        const { data: log } = await supabase.from("audit_logs").select("after").eq("action", "delivery_failed_flagged_address").eq("entity_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        results.push({ ...a, reason: (log?.after as any)?.reason ?? "motivo não registado" });
      }
      return new Response(JSON.stringify({ flagged: results }), { headers: cors });
    }

    if (action === "list_streets_in_quadra") {
      const { latitude, longitude } = body;
      if (typeof latitude !== "number" || typeof longitude !== "number") return new Response(JSON.stringify({ error: "latitude e longitude sao obrigatorios" }), { status: 400, headers: cors });
      const code = quadraCode(latitude, longitude);
      const { data: quadra } = await supabase.from("quadras").select("id, area_m2, kind").eq("code", code).maybeSingle();

      const delta = 0.0065;
      const { data: candidatos } = await supabase.from("field_records")
        .select("neighborhood_name, latitude, longitude")
        .not("neighborhood_name", "is", null)
        .gte("latitude", latitude - delta).lte("latitude", latitude + delta)
        .gte("longitude", longitude - delta).lte("longitude", longitude + delta)
        .limit(300);
      const contagem = new Map<string, number>();
      for (const c of candidatos ?? []) {
        const nome = (c.neighborhood_name || "").trim();
        if (!nome) continue;
        if (haversineMeters(latitude, longitude, c.latitude, c.longitude) > 700) continue;
        contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
      }
      const neighborhoodsNearby = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nome]) => nome);

      if (!quadra) return new Response(JSON.stringify({ quadra_code: code, area_m2: 14400, kind: "GRID", streets: [], neighborhoods_nearby: neighborhoodsNearby }), { headers: cors });
      const { data: streets } = await supabase.from("streets").select("id, name, next_seq, numbering_mode").eq("quadra_id", quadra.id).order("name");
      return new Response(JSON.stringify({ quadra_code: code, quadra_id: quadra.id, area_m2: quadra.area_m2, kind: quadra.kind, streets: streets ?? [], neighborhoods_nearby: neighborhoodsNearby }), { headers: cors });
    }

    if (action === "nearby_house_numbers") {
      const { street_id } = body;
      if (!street_id) return new Response(JSON.stringify({ error: "street_id e obrigatorio" }), { status: 400, headers: cors });
      const { data } = await supabase.from("addresses").select("house_number").eq("street_id", street_id).order("house_number").limit(20);
      return new Response(JSON.stringify({ house_numbers: (data ?? []).map((r) => r.house_number).filter(Boolean) }), { headers: cors });
    }

    if (action === "set_street_mode") {
      const { data: canValidate } = await supabase.rpc("can_validate_field", { check_user_id: callerId });
      if (!canValidate) return new Response(JSON.stringify({ error: "apenas supervisores/admins" }), { status: 403, headers: cors });
      const { street_id, numbering_mode, origin_lat, origin_lng, reason } = body;
      if (!["SEQUENCIAL", "METRICO", "FECHADO"].includes(numbering_mode)) return new Response(JSON.stringify({ error: "numbering_mode invalido" }), { status: 400, headers: cors });
      if (numbering_mode === "METRICO" && (origin_lat == null || origin_lng == null)) return new Response(JSON.stringify({ error: "ORIGIN_MISSING" }), { status: 422, headers: cors });
      const { data: before } = await supabase.from("streets").select("*").eq("id", street_id).single();
      const update: Record<string, unknown> = { numbering_mode };
      if (numbering_mode === "METRICO") { update.origin_lat = origin_lat; update.origin_lng = origin_lng; }
      const { error } = await supabase.from("streets").update(update).eq("id", street_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "street_mode_changed", entity_type: "street", entity_id: street_id, before, after: { numbering_mode, origin_lat, origin_lng, reason: reason ?? null } });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "close_quadra") {
      const { data: canValidate } = await supabase.rpc("can_validate_field", { check_user_id: callerId });
      if (!canValidate) return new Response(JSON.stringify({ error: "apenas supervisores/admins" }), { status: 403, headers: cors });
      const { quadra_id, confirmed_plates_or_notified } = body;
      if (!confirmed_plates_or_notified) return new Response(JSON.stringify({ error: "e preciso confirmar N9" }), { status: 400, headers: cors });
      const { data: streets } = await supabase.from("streets").select("*").eq("quadra_id", quadra_id);
      let doorsRenumbered = 0;
      for (const street of streets ?? []) {
        const { data: addrs } = await supabase.from("addresses").select("id, latitude, longitude, house_number").eq("street_id", street.id).eq("status", "APPROVED");
        if (!addrs || addrs.length === 0) { await supabase.from("streets").update({ numbering_mode: "FECHADO" }).eq("id", street.id); continue; }
        const originLat = street.origin_lat ?? addrs[0].latitude; const originLng = street.origin_lng ?? addrs[0].longitude;
        const ordered = [...addrs].sort((a, b) => haversineMeters(originLat, originLng, a.latitude, a.longitude) - haversineMeters(originLat, originLng, b.latitude, b.longitude));
        for (let i = 0; i < ordered.length; i++) {
          const newNumber = String(i + 1);
          if (ordered[i].house_number !== newNumber) {
            await supabase.from("audit_logs").insert({ actor_id: callerId, action: "address_renumbered_n9", entity_type: "address", entity_id: ordered[i].id, before: { house_number: ordered[i].house_number }, after: { house_number: newNumber } });
            await supabase.from("addresses").update({ house_number: newNumber }).eq("id", ordered[i].id);
            doorsRenumbered++;
          }
        }
        await supabase.from("streets").update({ numbering_mode: "FECHADO", next_seq: ordered.length + 1 }).eq("id", street.id);
      }
      return new Response(JSON.stringify({ ok: true, streets_closed: (streets ?? []).length, doors_renumbered: doorsRenumbered }), { headers: cors });
    }

    if (action === "submit") {
      const { device_id, latitude, longitude, photo_facade_url, photo_qr_url, street_id: chosenStreetId, street_name, new_unnamed_street, neighborhood_name, reference, accuracy_meters, accuracy_justification, override_duplicate, duplicate_justification, infill_base_house_number, place_kind, watermark_match, sync_operation_id } = body;
      if (!device_id || typeof latitude !== "number" || typeof longitude !== "number") return new Response(JSON.stringify({ error: "device_id, latitude e longitude sao obrigatorios" }), { status: 400, headers: cors });

      // Idempotência offline: uma mesma operação só pode criar um field_record.
      if (sync_operation_id) {
        const { data: previous } = await supabase.from("field_records")
          .select("id, status")
          .eq("sync_operation_id", sync_operation_id)
          .maybeSingle();
        if (previous) {
          return new Response(JSON.stringify({
            field_record_id: previous.id,
            status: previous.status,
            idempotent_replay: true,
          }), { headers: cors });
        }
      }
      if (!reference) return new Response(JSON.stringify({ error: "a referencia e obrigatoria" }), { status: 400, headers: cors });
      if (!chosenStreetId && !street_name && !new_unnamed_street) return new Response(JSON.stringify({ error: "STREET_MISSING" }), { status: 422, headers: cors });
      if (!photo_facade_url) return new Response(JSON.stringify({ error: "a foto da fachada e obrigatoria" }), { status: 400, headers: cors });
      if (typeof accuracy_meters === "number" && accuracy_meters > 15 && (!accuracy_justification || accuracy_justification.trim().length < 10)) return new Response(JSON.stringify({ error: "ACCURACY_BLOCK" }), { status: 422, headers: cors });

      const quadraId = await getOrCreateQuadra(supabase, latitude, longitude);
      if (!quadraId) return new Response(JSON.stringify({ error: "SCOPE_MISSING" }), { status: 422, headers: cors });
      const streetId = chosenStreetId || await getOrCreateStreet(supabase, quadraId, street_name, !!new_unnamed_street);
      if (!streetId) return new Response(JSON.stringify({ error: "STREET_MISSING" }), { status: 422, headers: cors });

      const { data: nearby } = await supabase.rpc("nearby_for_duplicates", { in_lat: latitude, in_lng: longitude, radius_meters: 15 });
      const closeAddress = (nearby ?? []).find((n: { source: string }) => n.source === "address");
      let status = "PENDING_REVIEW"; let duplicateOfId: string | null = null;
      if (closeAddress) { status = "DUPLICATE"; duplicateOfId = closeAddress.id; }

      const { data, error } = await supabase.from("field_records").insert({
        device_id, collected_by: callerId, latitude, longitude, location: `SRID=4326;POINT(${longitude} ${latitude})`,
        sync_operation_id: sync_operation_id ?? null,
        photo_url: photo_facade_url, photo_qr_url: photo_qr_url || null, quadra_id: quadraId, street_id: streetId, neighborhood_name,
        reference: (place_kind ? "[" + place_kind + "] " : "") + reference,
        infill_base_house_number: infill_base_house_number || null,
        accuracy_meters: accuracy_meters ?? null, accuracy_justification: accuracy_justification ?? null,
        duplicate_override_reason: (closeAddress && override_duplicate) ? duplicate_justification : null,
        status, duplicate_of_address_id: duplicateOfId,
        watermark_match: typeof watermark_match === "boolean" ? watermark_match : null,
      }).select("id, status").single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await supabase.from("audit_logs").insert({ actor_id: callerId, action: "field_record_submitted", entity_type: "field_record", entity_id: data.id, before: null, after: { status, street_id: streetId, quadra_id: quadraId, reference, watermark_match: watermark_match ?? null } });
      return new Response(JSON.stringify({ field_record_id: data.id, status: data.status, nearby_matches: nearby ?? [] }), { headers: cors });
    }

    if (action === "check_duplicates") {
      const { latitude, longitude } = body;
      if (typeof latitude !== "number" || typeof longitude !== "number") return new Response(JSON.stringify({ error: "latitude e longitude sao obrigatorios" }), { status: 400, headers: cors });
      const { data: nearby } = await supabase.rpc("nearby_for_duplicates", { in_lat: latitude, in_lng: longitude, radius_meters: 15 });
      const closeAddress = (nearby ?? []).find((n: { source: string }) => n.source === "address");
      if (!closeAddress) return new Response(JSON.stringify({ found: false }), { headers: cors });
      const { data: addr } = await supabase.from("addresses").select("postal_code, plus_code").eq("id", closeAddress.id).single();
      return new Response(JSON.stringify({ found: true, distance_meters: closeAddress.distance_meters, postal_code: addr?.postal_code, address_id: closeAddress.id }), { headers: cors });
    }

    if (action === "daily_count") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { count } = await supabase.from("field_records").select("*", { count: "exact", head: true }).eq("collected_by", callerId).gte("collected_at", today.toISOString());
      return new Response(JSON.stringify({ count: count ?? 0 }), { headers: cors });
    }

    if (action === "list_pending") {
      const { data: canValidate } = await supabase.rpc("can_validate_field", { check_user_id: callerId });
      if (!canValidate) return new Response(JSON.stringify({ error: "apenas supervisores/admins" }), { status: 403, headers: cors });
      const { data, error } = await supabase.from("field_records").select("id, latitude, longitude, reference, collected_at, photo_url, photo_qr_url, status, duplicate_of_address_id, duplicate_override_reason, infill_base_house_number, street_id, watermark_match, streets(name), quadras(code)").in("status", ["PENDING_REVIEW", "DUPLICATE"]).order("collected_at", { ascending: false }).limit(30);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      const withPreview = [];
      for (const rec of data ?? []) { const preview = await previewHouseNumber(supabase, rec.street_id, rec.latitude, rec.longitude, rec.infill_base_house_number); withPreview.push({ ...rec, preview_house_number: preview }); }
      return new Response(JSON.stringify({ records: withPreview }), { headers: cors });
    }

    if (action === "validate") {
      const { field_record_id, decision, province_id, municipality_id, commune_id, neighborhood_id, province_name } = body;
      if (!field_record_id || !decision) return new Response(JSON.stringify({ error: "field_record_id e decision sao obrigatorios" }), { status: 400, headers: cors });
      const { data: canValidate } = await supabase.rpc("can_validate_field", { check_user_id: callerId });
      if (!canValidate) return new Response(JSON.stringify({ error: "apenas supervisores/admins podem validar" }), { status: 403, headers: cors });
      const { data: record } = await supabase.from("field_records").select("*").eq("id", field_record_id).single();
      if (!record) return new Response(JSON.stringify({ error: "registo nao encontrado" }), { status: 404, headers: cors });

      if (decision === "reject") {
        await supabase.from("field_records").update({ status: "REJECTED", validated_by: callerId, validated_at: new Date().toISOString() }).eq("id", field_record_id);
        await supabase.from("notifications").insert({ user_id: record.collected_by, title: "O teu registo não foi aceite", body: "O registo de \"" + record.reference + "\" foi rejeitado pela revisão.", entity_type: "field_record", entity_id: field_record_id });
        return new Response(JSON.stringify({ ok: true, status: "REJECTED" }), { headers: cors });
      }
      if (decision === "duplicate") {
        await supabase.from("field_records").update({ status: "DUPLICATE", validated_by: callerId, validated_at: new Date().toISOString() }).eq("id", field_record_id);
        return new Response(JSON.stringify({ ok: true, status: "DUPLICATE" }), { headers: cors });
      }
      if (decision === "merge") {
        if (!record.duplicate_of_address_id) return new Response(JSON.stringify({ error: "sem morada para fundir" }), { status: 400, headers: cors });
        const { data: existing } = await supabase.from("addresses").select("*").eq("id", record.duplicate_of_address_id).single();
        if (!existing) return new Response(JSON.stringify({ error: "morada existente nao encontrada" }), { status: 404, headers: cors });
        const { data: submitterRolesMerge } = await supabase.from("organization_members").select("role").eq("user_id", record.collected_by);
        const submittedByRoleMerge = (submitterRolesMerge && submitterRolesMerge.length > 0) ? submitterRolesMerge[0].role : "cidadao";
        const merged: Record<string, unknown> = {
          reference: existing.reference || record.reference, photo_url: existing.photo_url || record.photo_url,
          latitude: record.latitude, longitude: record.longitude, location: `SRID=4326;POINT(${record.longitude} ${record.latitude})`,
          plus_code: plusCode(record.latitude, record.longitude, PLUS_CODE_DIGITOS),
          quadra_id: existing.quadra_id || record.quadra_id, street_id: existing.street_id || record.street_id,
          validated_by: callerId, validated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          flagged_for_review: false,
          accuracy_meters: record.accuracy_meters ?? existing.accuracy_meters,
        };
        var numberWasAssignedNow = false;
        if (!existing.house_number) {
          const assigned = await assignHouseNumber(supabase, merged.street_id as string, record.latitude, record.longitude, record.infill_base_house_number);
          if ("error" in assigned) return new Response(JSON.stringify({ error: assigned.error }), { status: 422, headers: cors });
          merged.house_number = assigned.number; merged.number_origin = assigned.origin; numberWasAssignedNow = true;
        }
        merged.confidence_score = calcularConfianca(record, submittedByRoleMerge, (merged.number_origin as string) || existing.number_origin || "AUTO");
        if (existing.status === "PROPOSED") merged.status = "APPROVED";
        if (province_id) merged.province_id = province_id;
        if (municipality_id) merged.municipality_id = municipality_id;
        if (commune_id) merged.commune_id = commune_id;
        if (neighborhood_id) merged.neighborhood_id = neighborhood_id;
        const { error: updError } = await supabase.from("addresses").update(merged).eq("id", existing.id);
        if (updError) return new Response(JSON.stringify({ error: updError.message }), { status: 400, headers: cors });
        await supabase.from("field_records").update({ status: "APPROVED", validated_by: callerId, validated_at: new Date().toISOString(), resulting_address_id: existing.id }).eq("id", field_record_id);
        await supabase.from("audit_logs").insert({ actor_id: callerId, action: "field_record_merged", entity_type: "address", entity_id: existing.id, before: existing, after: merged });
        if (numberWasAssignedNow) await supabase.from("audit_logs").insert({ actor_id: callerId, action: "number_assigned", entity_type: "address", entity_id: existing.id, before: null, after: { street_id: merged.street_id, house_number: merged.house_number, origin: merged.number_origin } });
        await supabase.from("notifications").insert({ user_id: record.collected_by, title: "O teu registo foi aprovado ✅", body: "Código postal: " + existing.postal_code + " · nº " + merged.house_number, entity_type: "address", entity_id: existing.id });
        return new Response(JSON.stringify({ ok: true, status: "MERGED", address_id: existing.id, house_number: merged.house_number }), { headers: cors });
      }
      if (decision === "approve") {
        let resolvedProvinceName = province_name;
        if (!resolvedProvinceName && province_id) { const { data: p } = await supabase.from("provinces").select("name").eq("id", province_id).single(); resolvedProvinceName = p?.name; }
        const postalCode = await generatePostalCode(supabase, record.latitude, record.longitude, resolvedProvinceName);
        const assigned = await assignHouseNumber(supabase, record.street_id, record.latitude, record.longitude, record.infill_base_house_number);
        if ("error" in assigned) return new Response(JSON.stringify({ error: assigned.error }), { status: 422, headers: cors });
        const { data: submitterRoles } = await supabase.from("organization_members").select("role").eq("user_id", record.collected_by);
        const submittedByRole = (submitterRoles && submitterRoles.length > 0) ? submitterRoles[0].role : "cidadao";
        const { data: newAddress, error: addrError } = await supabase.from("addresses").insert({
          latitude: record.latitude, longitude: record.longitude, location: `SRID=4326;POINT(${record.longitude} ${record.latitude})`,
          plus_code: plusCode(record.latitude, record.longitude, PLUS_CODE_DIGITOS),
          house_number: assigned.number, number_origin: assigned.origin, reference: record.reference,
          photo_url: record.photo_url, quadra_id: record.quadra_id, street_id: record.street_id,
          postal_code: postalCode, province_id, municipality_id, commune_id, neighborhood_id,
          status: "APPROVED", source: "field_survey", created_by: record.collected_by, validated_by: callerId, validated_at: new Date().toISOString(),
          submitted_by_role: submittedByRole,
          accuracy_meters: record.accuracy_meters ?? null,
          confidence_score: calcularConfianca(record, submittedByRole, assigned.origin),
        }).select("id, postal_code, plus_code").single();
        if (addrError) return new Response(JSON.stringify({ error: addrError.message }), { status: 400, headers: cors });
        await supabase.from("field_records").update({ status: "APPROVED", validated_by: callerId, validated_at: new Date().toISOString(), resulting_address_id: newAddress.id }).eq("id", field_record_id);
        await supabase.from("audit_logs").insert({ actor_id: callerId, action: "number_assigned", entity_type: "address", entity_id: newAddress.id, before: null, after: { street_id: record.street_id, house_number: assigned.number, origin: assigned.origin } });
        await supabase.from("notifications").insert({ user_id: record.collected_by, title: "O teu registo foi aprovado ✅", body: "Código postal: " + postalCode + " · nº " + assigned.number + " — vê os detalhes completos em Guardados.", entity_type: "address", entity_id: newAddress.id });
        return new Response(JSON.stringify({ ok: true, status: "APPROVED", address_id: newAddress.id, postal_code: postalCode, house_number: assigned.number }), { headers: cors });
      }
      return new Response(JSON.stringify({ error: "decision invalida" }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
