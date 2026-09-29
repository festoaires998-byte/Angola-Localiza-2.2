import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Export Service (Fase 15, endurecido agora - tinha ficado
// de fora do endurecimento da Fase 16 por engano). created_by vem sempre do
// token de login real.

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
  if (!callerId) {
    return new Response(JSON.stringify({ error: "sessao invalida - inicia sessao novamente" }), { status: 401, headers: cors });
  }

  try {
    const body = await req.json();
    const { format, status, province_id, municipality_id } = body;
    if (!format) {
      return new Response(JSON.stringify({ error: "format e obrigatorio" }), { status: 400, headers: cors });
    }
    if (!["csv", "geojson"].includes(format)) {
      return new Response(JSON.stringify({ error: "formato suportado agora: csv ou geojson (xlsx/pdf ficam para os ecras)" }), { status: 400, headers: cors });
    }

    let query = supabase.from("addresses").select("public_id, postal_code, plus_code, latitude, longitude, house_number, reference, status");
    if (status) query = query.eq("status", status);
    if (province_id) query = query.eq("province_id", province_id);
    if (municipality_id) query = query.eq("municipality_id", municipality_id);

    const { data, error } = await query.limit(5000);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

    let fileContent: string;
    if (format === "csv") {
      const header = "public_id,postal_code,plus_code,latitude,longitude,house_number,reference,status";
      const rows = (data ?? []).map((r) =>
        [r.public_id, r.postal_code, r.plus_code, r.latitude, r.longitude, r.house_number ?? "", r.reference ?? "", r.status]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
      );
      fileContent = [header, ...rows].join("\n");
    } else {
      fileContent = JSON.stringify({
        type: "FeatureCollection",
        features: (data ?? []).map((r) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
          properties: { public_id: r.public_id, postal_code: r.postal_code, plus_code: r.plus_code, house_number: r.house_number, reference: r.reference, status: r.status },
        })),
      });
    }

    await supabase.from("exports").insert({
      created_by: callerId, format, filter: { status: status ?? null, province_id: province_id ?? null, municipality_id: municipality_id ?? null },
      row_count: (data ?? []).length, status: "COMPLETED",
    });

    return new Response(JSON.stringify({ row_count: (data ?? []).length, format, content: fileContent }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
