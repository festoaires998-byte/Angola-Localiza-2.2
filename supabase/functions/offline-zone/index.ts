import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Offline Zone Prep (v2)
// Prepara uma zona para trabalho offline: devolve as moradas ja conhecidas
// num raio a volta de um ponto, para o tecnico guardar no telemovel ANTES
// de perder rede. Usado para: consultar o que ja existe, e detetar
// duplicados sem precisar de rede.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    const body = await req.json();
    const { latitude, longitude, radius_meters } = body;
    if (typeof latitude !== "number" || typeof longitude !== "number") return new Response(JSON.stringify({ error: "latitude e longitude sao obrigatorios" }), { status: 400, headers: cors });
    const raio = Math.min(Math.max(radius_meters || 800, 100), 2000); // entre 100m e 2km, por defeito 800m

    // Pre-filtragem grosseira por caixa (rapida), depois filtro exato pela distancia real
    const delta = raio / 100000; // aproximacao generosa em graus
    const { data: candidatos } = await supabase.from("addresses")
      .select("id, postal_code, plus_code, latitude, longitude, house_number, reference, streets(name)")
      .in("status", ["APPROVED", "OFFICIAL", "PUBLISHED"])
      .gte("latitude", latitude - delta).lte("latitude", latitude + delta)
      .gte("longitude", longitude - delta).lte("longitude", longitude + delta)
      .limit(500);

    const moradas = (candidatos ?? [])
      .filter((a) => haversineMeters(latitude, longitude, a.latitude, a.longitude) <= raio)
      .map((a) => ({ id: a.id, postal_code: a.postal_code, plus_code: a.plus_code, latitude: a.latitude, longitude: a.longitude, house_number: a.house_number, reference: a.reference, street_name: (a.streets as any)?.name ?? null }));

    return new Response(JSON.stringify({
      centro: { latitude, longitude }, raio_metros: raio,
      moradas, total_moradas: moradas.length,
      preparado_em: new Date().toISOString(),
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
