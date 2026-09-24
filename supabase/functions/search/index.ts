import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Angola Localiza - search (DESATIVADA)
// Esta função antiga lia moradas com a service role sem respeitar a
// privacidade (moradas por validar e "Privadas"). Foi substituída pela
// função "pesquisa" (com sessão) e pelo "pesquisa?action=cartao" (link
// público de uma morada). Fica publicada só para responder com uma
// explicação clara a quem ainda a chamar; não lê a base de dados.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(
    JSON.stringify({ error: "funcao desativada: use a funcao pesquisa", substituida_por: "pesquisa" }),
    { status: 410, headers: cors },
  );
});
