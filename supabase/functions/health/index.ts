import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Health Check (Observabilidade)
// GET  ?check=all        -> visao geral
// GET  ?check=database   -> testa ligacao real a base de dados

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const startedAt = Date.now();
  const url = new URL(req.url);
  const check = url.searchParams.get("check") || "all";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const result: Record<string, unknown> = { status: "ok", checked_at: new Date().toISOString() };

  if (check === "all" || check === "database") {
    const dbStart = Date.now();
    try {
      const { error } = await supabase.from("postal_code_schemes").select("id").limit(1);
      result.database = {
        status: error ? "down" : "ok",
        latency_ms: Date.now() - dbStart,
        error: error ? error.message : null,
      };
      if (error) result.status = "degraded";
    } catch (e) {
      result.database = { status: "down", error: String(e) };
      result.status = "degraded";
    }
  }

  if (check === "all") {
    const functionsToCheck = ["generate-postal-code", "qr-service", "search", "admin"];
    result.edge_functions = functionsToCheck;
    result.uptime_note = "Edge Functions nao tem endpoint de uptime individual - o Supabase reporta logs e erros no painel do projeto automaticamente.";
  }

  result.response_time_ms = Date.now() - startedAt;

  return new Response(JSON.stringify(result), {
    status: result.status === "ok" ? 200 : 503,
    headers: cors,
  });
});
