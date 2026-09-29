import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Import Service (Fase 15, endurecido na Fase 16)
// created_by e sempre confirmado pelo token de login real.

function parseCsv(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim()));
}

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
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "process_csv";
    const body = await req.json();

    if (action === "process_csv") {
      const { csv_text, organization_id } = body;
      if (!csv_text) {
        return new Response(JSON.stringify({ error: "csv_text e obrigatorio" }), { status: 400, headers: cors });
      }

      const rows = parseCsv(csv_text);
      const header = rows[0].map((h) => h.toLowerCase());
      const dataRows = rows.slice(1);

      const idxLat = header.indexOf("latitude");
      const idxLng = header.indexOf("longitude");
      const idxHouse = header.indexOf("house_number");
      const idxRef = header.indexOf("reference");

      if (idxLat === -1 || idxLng === -1) {
        return new Response(JSON.stringify({ error: "o CSV precisa das colunas latitude e longitude" }), { status: 400, headers: cors });
      }

      const { data: importRow, error: importError } = await supabase
        .from("imports")
        .insert({ organization_id: organization_id ?? null, created_by: callerId, file_type: "csv", total_rows: dataRows.length })
        .select("id")
        .single();
      if (importError) return new Response(JSON.stringify({ error: importError.message }), { status: 400, headers: cors });

      let validCount = 0, invalidCount = 0, duplicateCount = 0;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNumber = i + 2;
        const lat = parseFloat(row[idxLat]);
        const lng = parseFloat(row[idxLng]);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          invalidCount++;
          await supabase.from("import_errors").insert({
            import_id: importRow.id, row_number: rowNumber,
            error_message: "latitude/longitude invalidas ou em falta", raw_data: row,
          });
          continue;
        }

        const { data: nearby } = await supabase.rpc("nearby_addresses", { in_lat: lat, in_lng: lng, radius_meters: 10 });
        if (nearby && nearby.length > 0) {
          duplicateCount++;
          await supabase.from("import_errors").insert({
            import_id: importRow.id, row_number: rowNumber,
            error_message: "possivel duplicado de morada existente", raw_data: row,
          });
          continue;
        }

        const { error: insertError } = await supabase.from("addresses").insert({
          latitude: lat, longitude: lng,
          location: `SRID=4326;POINT(${lng} ${lat})`,
          house_number: idxHouse >= 0 ? row[idxHouse] : null,
          reference: idxRef >= 0 ? row[idxRef] : null,
          status: "PROPOSED", source: "import", created_by: callerId,
        });

        if (insertError) {
          invalidCount++;
          await supabase.from("import_errors").insert({
            import_id: importRow.id, row_number: rowNumber, error_message: insertError.message, raw_data: row,
          });
        } else {
          validCount++;
        }
      }

      await supabase.from("imports").update({
        status: "COMPLETED", valid_rows: validCount, invalid_rows: invalidCount,
        duplicate_rows: duplicateCount, completed_at: new Date().toISOString(),
      }).eq("id", importRow.id);

      return new Response(JSON.stringify({
        import_id: importRow.id, total: dataRows.length, valid: validCount, invalid: invalidCount, duplicates: duplicateCount,
      }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
