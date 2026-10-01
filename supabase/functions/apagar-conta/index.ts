import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { BUCKETS_PESSOAIS, caminhosDaPasta, confirmacaoValida } from "./regras.ts";

// Angola Localiza - Apagar a conta (v1)
// Pedido pela propria pessoa, com sessao, a escrever "APAGAR". Apaga e
// anonimiza (decisao do dono a 01/10/2026):
// 1) apaga os ficheiros pessoais (kyc-artifacts/<id>/ e chat-media/<id>/);
// 2) limpa os dados na base de dados (funcao SQL apagar_dados_da_conta);
// 3) eliminacao suave da conta: deixa de poder entrar, email e telefone
//    baralhados; entregas, provas e moradas publicas ficam com um id anonimo.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const responder = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: authData } = await supabase.auth.getUser(token);
  const userId = authData?.user?.id;
  if (!userId) return responder({ error: "sessao invalida - inicia sessao novamente" }, 401);

  try {
    const action = new URL(req.url).searchParams.get("action") || "apagar";
    if (action !== "apagar") return responder({ error: "acao desconhecida" }, 400);
    const body = await req.json().catch(() => ({}));
    if (!confirmacaoValida(body?.confirmacao)) {
      return responder({ error: "CONFIRMACAO_EM_FALTA: escreve APAGAR para confirmar" }, 400);
    }

    // Um super admin nao se apaga sozinho (podia deixar a plataforma sem administrador).
    const { data: cargos } = await supabase.from("organization_members").select("role").eq("user_id", userId);
    if ((cargos ?? []).some((c: { role: string }) => c.role === "super_admin")) {
      return responder({ error: "SUPER_ADMIN: pede a outro super admin para te tirar o cargo antes de apagares a conta" }, 409);
    }

    // 1) Ficheiros pessoais.
    for (const bucket of BUCKETS_PESSOAIS) {
      for (let volta = 0; volta < 20; volta++) {
        const { data: lista, error: erroLista } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
        if (erroLista) return responder({ error: `nao foi possivel ler ${bucket}: ${erroLista.message}` }, 500);
        const caminhos = caminhosDaPasta(userId, lista);
        if (caminhos.length === 0) break;
        const { error: erroApagar } = await supabase.storage.from(bucket).remove(caminhos);
        if (erroApagar) return responder({ error: `nao foi possivel apagar ${bucket}: ${erroApagar.message}` }, 500);
      }
    }

    // 2) Dados na base de dados.
    const { data: resumo, error: erroDados } = await supabase.rpc("apagar_dados_da_conta", { p_user: userId });
    if (erroDados) return responder({ error: erroDados.message }, 500);

    // 3) Conta: sem nome e eliminacao suave (o id fica, anonimo).
    await supabase.auth.admin.updateUserById(userId, { user_metadata: {} });
    const { error: erroConta } = await supabase.auth.admin.deleteUser(userId, true);
    if (erroConta) return responder({ error: erroConta.message }, 500);

    return responder({ ok: true, ...(resumo ?? {}) });
  } catch (e) {
    return responder({ error: String(e) }, 500);
  }
});
