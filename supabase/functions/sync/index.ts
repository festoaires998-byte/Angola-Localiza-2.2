import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { REENCAMINHADAS, eUuid, limparEdicaoMorada, limparFavorito, limparMoradaNova, podeEditarMorada } from "./regras.ts";

// Angola Localiza - Sync Service (v8)
// Recebe a fila feita sem rede (app e site) e aplica cada operação uma vez.
// v8 (segurança): a sync grava com a service role, por isso já não copia o
// payload tal como vem:
// - create_address: morada sempre "PROPOSED" (por validar), só com os campos
//   que uma pessoa pode escolher; o estado e a validação só mudam na field-service;
// - update_address: só quem criou, enquanto está por validar (ou um
//   administrador), e nunca o estado nem os campos da validação;
// - create_favorite: só morada, categoria e nome, sempre de quem pede;
// - uma operação (operation_id) de outra pessoa nunca é tocada;
// - a chave pública (anon) vem do ambiente, não do código.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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
    const operations = body.operations as Array<{
      operation_id: string;
      device_id: string;
      operation_type: string;
      payload: Record<string, unknown>;
    }>;

    if (!Array.isArray(operations) || operations.length === 0) {
      return new Response(JSON.stringify({ error: "operations (array) e obrigatorio" }), { status: 400, headers: cors });
    }

    const results = [];

    for (const op of operations) {
      if (!op || !eUuid(op.operation_id)) {
        results.push({ operation_id: op?.operation_id ?? null, status: "FAILED", error: "operation_id invalido" });
        continue;
      }

      const { data: existing } = await supabase
        .from("sync_operations")
        .select("operation_id, sync_status, user_id")
        .eq("operation_id", op.operation_id)
        .maybeSingle();

      if (existing && existing.user_id !== callerId) {
        results.push({ operation_id: op.operation_id, status: "FAILED", error: "esta operacao pertence a outra pessoa" });
        continue;
      }

      if (existing && existing.sync_status === "SYNCED") {
        results.push({ operation_id: op.operation_id, status: "SYNCED", note: "ja tinha sido sincronizada antes" });
        continue;
      }

      if (!existing) {
        await supabase.from("sync_operations").insert({
          operation_id: op.operation_id,
          device_id: op.device_id,
          user_id: callerId,
          operation_type: op.operation_type,
          payload: op.payload,
          sync_status: "SYNCING",
        });
      } else {
        await supabase.from("sync_operations").update({ sync_status: "SYNCING" }).eq("operation_id", op.operation_id);
      }

      let finalStatus = "SYNCED";
      let errorMessage: string | null = null;

      try {
        if (op.operation_type === "create_address") {
          const limpa = limparMoradaNova(op.payload, callerId);
          if (!limpa.ok) throw new Error(limpa.erro);
          const { error } = await supabase.from("addresses").insert(limpa.linha);
          if (error) throw error;
        } else if (op.operation_type === "update_address") {
          const addressId = op.payload?.id;
          if (!eUuid(addressId)) throw new Error("id da morada invalido");
          const clientBasedOn = op.payload.based_on_updated_at as string | undefined;
          const { id: _id, based_on_updated_at: _base, ...fields } = op.payload;
          const limpa = limparEdicaoMorada(fields);
          if (!limpa.ok) throw new Error(limpa.erro);

          const { data: current } = await supabase
            .from("addresses")
            .select("status, updated_at, created_by")
            .eq("id", addressId)
            .maybeSingle();
          if (!current) throw new Error("morada nao encontrada");

          const { data: isAdminRes } = await supabase.rpc("is_admin", { check_user_id: callerId });
          if (!podeEditarMorada(current, callerId, isAdminRes === true)) throw new Error("nao autorizado a editar esta morada");

          const isValidated = ["APPROVED", "OFFICIAL"].includes(current.status);
          const changedSinceOffline = clientBasedOn && new Date(current.updated_at).getTime() !== new Date(clientBasedOn).getTime();

          if (isValidated && changedSinceOffline) {
            finalStatus = "CONFLICT";
          } else {
            const { error } = await supabase.from("addresses").update({ ...limpa.linha, updated_at: new Date().toISOString() }).eq("id", addressId);
            if (error) throw error;
          }
        } else if (op.operation_type === "create_favorite") {
          const limpa = limparFavorito(op.payload, callerId);
          if (!limpa.ok) throw new Error(limpa.erro);
          const { error } = await supabase.from("favorites").upsert(limpa.linha, { onConflict: "user_id,address_id" });
          if (error) throw error;
        } else if (REENCAMINHADAS[op.operation_type]) {
          // As regras destas operações estão na função de destino (com a sessão de quem pede).
          const resp = await fetch(supabaseUrl + "/functions/v1/" + REENCAMINHADAS[op.operation_type], {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": anonKey, "Authorization": "Bearer " + token },
            body: JSON.stringify(op.payload),
          });
          const respData = await resp.json();
          if (respData.error) throw new Error(respData.error);
        } else {
          finalStatus = "FAILED";
          errorMessage = `operation_type desconhecido: ${op.operation_type}`;
        }
      } catch (e) {
        finalStatus = "FAILED";
        errorMessage = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      }

      await supabase.from("sync_operations").update({
        sync_status: finalStatus,
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      }).eq("operation_id", op.operation_id);

      results.push({ operation_id: op.operation_id, status: finalStatus, error: errorMessage });
    }

    return new Response(JSON.stringify({ results }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
