import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Address Card Service (agora respeita visibility_level)
// PUBLIC: tudo visivel. LIMITED: esconde contacto. PRIVATE/RESTRICTED: so
// dono/admin conseguem ver o cartao.

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

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "get";
    const body = req.method === "POST" ? await req.json() : {};

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData } = await supabase.auth.getUser(token);
    const callerId = authData?.user?.id ?? null;

    if (action === "create") {
      const { address_id, recipient_name, recipient_phone, note } = body;
      if (!address_id) {
        return new Response(JSON.stringify({ error: "address_id e obrigatorio" }), { status: 400, headers: cors });
      }
      const { data, error } = await supabase
        .from("address_cards")
        .insert({ address_id, created_by: callerId, recipient_name, recipient_phone, note })
        .select("id")
        .single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ card_id: data.id, share_url: `https://codigopostal.ao/a/${data.id}` }), { headers: cors });
    }

    if (action === "get") {
      const cardId = body.card_id || url.searchParams.get("card_id");
      if (!cardId) return new Response(JSON.stringify({ error: "card_id em falta" }), { status: 400, headers: cors });

      const { data: card, error } = await supabase
        .from("address_cards")
        .select("id, recipient_name, recipient_phone, note, created_at, address_id")
        .eq("id", cardId)
        .single();
      if (error || !card) {
        return new Response(JSON.stringify({ found: false }), { status: 404, headers: cors });
      }

      const { data: address } = await supabase
        .from("addresses")
        .select(`
          public_id, postal_code, plus_code, zip_code, latitude, longitude, reference, status, house_number, visibility_level, created_by,
          provinces(name), municipalities(name), communes(name), neighborhoods(name), streets(name)
        `)
        .eq("id", card.address_id)
        .single();

      if (!address || !["PUBLISHED", "APPROVED", "OFFICIAL"].includes(address.status)) {
        return new Response(JSON.stringify({ found: false, reason: "morada_nao_publica" }), { status: 404, headers: cors });
      }

      const isOwnerOrAdmin = callerId && (callerId === address.created_by || (await supabase.rpc("is_admin", { check_user_id: callerId })).data);

      if (["PRIVATE", "RESTRICTED"].includes(address.visibility_level) && !isOwnerOrAdmin) {
        return new Response(JSON.stringify({ found: false, reason: "morada_privada" }), { status: 403, headers: cors });
      }

      const cardOut: Record<string, unknown> = { recipient_name: card.recipient_name, note: card.note };
      if (address.visibility_level !== "LIMITED" || isOwnerOrAdmin) {
        cardOut.recipient_phone = card.recipient_phone;
      }

      const { visibility_level, created_by, ...addressOut } = address;

      return new Response(JSON.stringify({
        found: true,
        card: cardOut,
        address: addressOut,
        share_url: `https://codigopostal.ao/a/${card.id}`,
      }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
