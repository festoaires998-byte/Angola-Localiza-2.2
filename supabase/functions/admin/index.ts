import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Angola Localiza - Admin Service (v7: super_admin pode eliminar registos de
// auditoria, um a um ou todos de vez)

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
    const action = url.searchParams.get("action") || "statistics";
    const body = req.method === "POST" ? await req.json() : {};

    async function requireAdmin(id: string) {
      const { data } = await supabase.rpc("is_admin", { check_user_id: id });
      return !!data;
    }
    async function requireSuperAdmin(id: string) {
      const { data } = await supabase.from("organization_members").select("role").eq("user_id", id);
      return (data ?? []).some((m) => m.role === "super_admin");
    }

    type AdminScope = { all: boolean; provinces: string[]; municipalities: string[] };
    async function getAdminScope(id: string): Promise<AdminScope> {
      const { data, error } = await supabase.from("organization_members")
        .select("role, scope_province_id, scope_municipality_id").eq("user_id", id);
      if (error) throw error;
      const members = data ?? [];
      if (members.some((m) => m.role === "super_admin" || m.role === "admin_nacional")) {
        return { all: true, provinces: [], municipalities: [] };
      }
      return {
        all: false,
        provinces: [...new Set(members.filter((m) => m.role === "admin_provincial").map((m) => m.scope_province_id).filter(Boolean))],
        municipalities: [...new Set(members.filter((m) => m.role === "admin_municipal").map((m) => m.scope_municipality_id).filter(Boolean))],
      };
    }
    async function scopedAddressIds(scope: AdminScope): Promise<string[]> {
      let q = supabase.from("addresses").select("id");
      if (!scope.all) {
        if (scope.municipalities.length) q = q.in("municipality_id", scope.municipalities);
        else if (scope.provinces.length) q = q.in("province_id", scope.provinces);
        else return [];
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((x) => x.id);
    }
    async function logAudit(actorId: string, actionName: string, entityType: string, entityId: string, before: unknown, after: unknown) {
      await supabase.from("audit_logs").insert({ actor_id: actorId, action: actionName, entity_type: entityType, entity_id: entityId, before, after });
    }

    if (action === "approve_address" || action === "reject_address" || action === "suspend_address") {
      const { address_id, reason } = body;
      if (!address_id) return new Response(JSON.stringify({ error: "address_id e obrigatorio" }), { status: 400, headers: cors });
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });

      const { data: canManage } = await supabase.rpc("can_manage_address", { check_user_id: callerId, target_address_id: address_id });
      if (!canManage) return new Response(JSON.stringify({ error: "esta morada esta fora da tua jurisdicao (provincia/municipio)" }), { status: 403, headers: cors });

      const { data: before } = await supabase.from("addresses").select("status, created_by").eq("id", address_id).single();
      if (!before) return new Response(JSON.stringify({ error: "morada nao encontrada" }), { status: 404, headers: cors });

      const newStatus = action === "approve_address" ? "APPROVED" : action === "reject_address" ? "CHANGED" : "SUSPENDED";
      const auditAction = action === "approve_address" ? "address_approved" : action === "reject_address" ? "address_rejected" : "address_suspended";

      const { error } = await supabase.from("addresses").update({ status: newStatus, validated_by: callerId, updated_at: new Date().toISOString() }).eq("id", address_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

      await logAudit(callerId, auditAction, "address", address_id, before, { status: newStatus, reason: reason ?? null });

      if (before.created_by) {
        const titles: Record<string, string> = { approve_address: "A tua morada foi aprovada", reject_address: "A tua morada foi rejeitada", suspend_address: "A tua morada foi suspensa" };
        await supabase.from("notifications").insert({ user_id: before.created_by, title: titles[action], body: reason || null, entity_type: "address", entity_id: address_id });
      }
      return new Response(JSON.stringify({ ok: true, status: newStatus }), { headers: cors });
    }

    if (action === "audit") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const entityType = url.searchParams.get("entity_type");
      const scope = await getAdminScope(callerId);
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50);
      if (!scope.all) {
        let mq = supabase.from("organization_members").select("user_id");
        mq = scope.municipalities.length ? mq.in("scope_municipality_id", scope.municipalities) : scope.provinces.length ? mq.in("scope_province_id", scope.provinces) : mq.eq("user_id", "00000000-0000-0000-0000-000000000000");
        const { data: scopedMembers, error: me } = await mq;
        if (me) return new Response(JSON.stringify({ error: me.message }), { status: 400, headers: cors });
        const actorIds = (scopedMembers ?? []).map((m) => m.user_id);
        query = query.in("actor_id", actorIds.length ? actorIds : ["00000000-0000-0000-0000-000000000000"]);
      }
      if (entityType) query = query.eq("entity_type", entityType);
      const { data, error } = await query;
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ logs: data }), { headers: cors });
    }

    if (action === "delete_audit_log") {
      if (!(await requireSuperAdmin(callerId))) return new Response(JSON.stringify({ error: "apenas o super admin pode eliminar registos de auditoria" }), { status: 403, headers: cors });
      const { log_id } = body;
      if (!log_id) return new Response(JSON.stringify({ error: "log_id e obrigatorio" }), { status: 400, headers: cors });
      const { error } = await supabase.from("audit_logs").delete().eq("id", log_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "clear_audit_logs") {
      if (!(await requireSuperAdmin(callerId))) return new Response(JSON.stringify({ error: "apenas o super admin pode limpar a auditoria" }), { status: 403, headers: cors });
      const { confirm } = body;
      if (confirm !== "ELIMINAR TUDO") return new Response(JSON.stringify({ error: "confirmacao em falta" }), { status: 400, headers: cors });
      const { count } = await supabase.from("audit_logs").select("*", { count: "exact", head: true });
      const { error } = await supabase.from("audit_logs").delete().not("id", "is", null);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true, deleted: count ?? 0 }), { headers: cors });
    }

    if (action === "list_estafetas") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const scope = await getAdminScope(callerId);
      let memberQuery = supabase.from("organization_members").select("user_id, scope_province_id, scope_municipality_id").eq("role", "estafeta");
      if (!scope.all) memberQuery = scope.municipalities.length ? memberQuery.in("scope_municipality_id", scope.municipalities) : scope.provinces.length ? memberQuery.in("scope_province_id", scope.provinces) : memberQuery.eq("user_id", "00000000-0000-0000-0000-000000000000");
      const { data: members } = await memberQuery;
      const ids = (members ?? []).map((m) => m.user_id);
      const results = [];
      for (const id of ids) { const { data: u } = await supabase.auth.admin.getUserById(id); if (u?.user) results.push({ id: u.user.id, email: u.user.email }); }
      return new Response(JSON.stringify({ estafetas: results }), { headers: cors });
    }

    if (action === "list_staff") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const scope = await getAdminScope(callerId);
      let memberQuery = supabase.from("organization_members")
        .select("user_id, role, onboarded_via, organizations(name), scope_province_id, scope_municipality_id")
        .order("role").limit(100);
      if (!scope.all) memberQuery = scope.municipalities.length ? memberQuery.in("scope_municipality_id", scope.municipalities) : scope.provinces.length ? memberQuery.in("scope_province_id", scope.provinces) : memberQuery.eq("user_id", "00000000-0000-0000-0000-000000000000");
      const { data: members } = await memberQuery;
      const results = [];
      for (const m of members ?? []) {
        const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
        const { data: identity } = await supabase.from("user_identity").select("status").eq("user_id", m.user_id).maybeSingle();
        let provinceName = null;
        if (m.scope_province_id) { const { data: p } = await supabase.from("provinces").select("name").eq("id", m.scope_province_id).single(); provinceName = p?.name; }
        results.push({ email: u?.user?.email, role: m.role, sector: m.organizations?.name, onboarded_via: m.onboarded_via, identity_status: identity?.status || "PENDING_ID", scope_province_name: provinceName });
      }
      return new Response(JSON.stringify({ staff: results }), { headers: cors });
    }

    if (action === "list_unassigned_deliveries") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const scope = await getAdminScope(callerId);
      const addressIds = await scopedAddressIds(scope);
      const { data, error } = await supabase.from("deliveries").select("id, tracking_code, recipient_name, status, address_id, addresses(confidence_score,status,flagged_for_review,quadra_id,latitude,longitude)").eq("status", "CREATED").in("address_id", addressIds.length ? addressIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(20);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ deliveries: data }), { headers: cors });
    }

    if (action === "dispatch_context") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const deliveryId = body.delivery_id;
      const { data: delivery, error: de } = await supabase.from("deliveries").select("id,address_id,addresses(quadra_id)").eq("id", deliveryId).single();
      if (de || !delivery) return new Response(JSON.stringify({ error: "Entrega não encontrada." }), { status: 404, headers: cors });
      const quadraId = (delivery as any).addresses?.quadra_id;
      if (!quadraId) return new Response(JSON.stringify({ context: null, reason: "Destino sem quadra associada." }), { headers: cors });
      const { data: hist, error: he } = await supabase.from("delivery_status_history")
        .select("status,reason,deliveries!inner(assigned_driver,address_id,addresses!inner(quadra_id))")
        .eq("deliveries.addresses.quadra_id", quadraId).limit(5000);
      if (he) return new Response(JSON.stringify({ error: he.message }), { status: 400, headers: cors });
      const byDriver: Record<string,{events:number;delivered:number;failed:number;failures:Record<string,number>}> = {};
      for (const row of hist ?? []) {
        const driver=(row as any).deliveries?.assigned_driver;
        if (!driver) continue;
        const b=byDriver[driver] ?? (byDriver[driver]={events:0,delivered:0,failed:0,failures:{}});
        b.events++; if(row.status==="DELIVERED") b.delivered++;
        if(row.status==="FAILED"){ b.failed++; if(row.reason) b.failures[row.reason]=(b.failures[row.reason]??0)+1; }
      }
      return new Response(JSON.stringify({quadra_id:quadraId,drivers:byDriver}),{headers:cors});
    }

    if (action === "territorial_stats") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const { data, error } = await supabase.from("delivery_status_history")
        .select("status, reason, created_at, deliveries(address_id, addresses(quadra_id))")
        .order("created_at", { ascending: false }).limit(5000);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
      const byQuadra: Record<string, { total: number; delivered: number; failed: number; failure_reasons: Record<string, number> }> = {};
      for (const row of data ?? []) {
        const qid = (row as any).deliveries?.addresses?.quadra_id;
        if (!qid) continue;
        const bucket = byQuadra[qid] ?? (byQuadra[qid] = { total: 0, delivered: 0, failed: 0, failure_reasons: {} });
        bucket.total++;
        if (row.status === "DELIVERED") bucket.delivered++;
        if (row.status === "FAILED") {
          bucket.failed++;
          if (row.reason) bucket.failure_reasons[row.reason] = (bucket.failure_reasons[row.reason] ?? 0) + 1;
        }
      }
      const results = Object.entries(byQuadra).map(([quadra_id, v]) => ({
        quadra_id, total_events: v.total, delivered: v.delivered, failed: v.failed,
        failure_rate: v.total ? Number((v.failed / v.total).toFixed(4)) : 0,
        failure_reasons: v.failure_reasons,
      })).sort((a,b) => b.total_events - a.total_events);
      return new Response(JSON.stringify({ territorial_stats: results, sample_size: data?.length ?? 0, limit: 5000 }), { headers: cors });
    }

    if (action === "dados_resumo") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const scope = await getAdminScope(callerId);
      const addressIds = await scopedAddressIds(scope);
      const { data: rows } = await supabase.from("addresses").select("status, provinces(name)").in("id", addressIds.length ? addressIds : ["00000000-0000-0000-0000-000000000000"]);
      const byProvince: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      (rows ?? []).forEach((r: any) => {
        const p = r.provinces?.name || "sem província";
        byProvince[p] = (byProvince[p] ?? 0) + 1;
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      });
      return new Response(JSON.stringify({ by_province: byProvince, by_status: byStatus, total: rows?.length ?? 0 }), { headers: cors });
    }

    if (action === "statistics") {
      if (!(await requireAdmin(callerId))) return new Response(JSON.stringify({ error: "nao autorizado" }), { status: 403, headers: cors });
      const scope = await getAdminScope(callerId);
      const addressIds = await scopedAddressIds(scope);
      const safeIds = addressIds.length ? addressIds : ["00000000-0000-0000-0000-000000000000"];
      const [addresses, statuses, deliveries, deliveryStatuses, fieldPending, kycPending] = await Promise.all([
        supabase.from("addresses").select("*", { count: "exact", head: true }).in("id", safeIds),
        supabase.from("addresses").select("status").in("id", safeIds),
        supabase.from("deliveries").select("*", { count: "exact", head: true }).in("address_id", safeIds),
        supabase.from("deliveries").select("status").in("address_id", safeIds),
        supabase.from("field_records").select("*", { count: "exact", head: true }).eq("status", "PENDING_REVIEW"),
        supabase.from("identity_verifications").select("*", { count: "exact", head: true }).eq("status", "SUBMITTED"),
      ]);
      const statusCounts: Record<string, number> = {};
      (statuses.data ?? []).forEach((r: { status: string }) => { statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1; });
      const deliveryCounts: Record<string, number> = {};
      (deliveryStatuses.data ?? []).forEach((r: { status: string }) => { deliveryCounts[r.status] = (deliveryCounts[r.status] ?? 0) + 1; });
      const delivered = deliveryCounts.DELIVERED ?? 0;
      const failed = deliveryCounts.FAILED ?? 0;
      const successRate = (delivered + failed) > 0 ? Math.round((delivered / (delivered + failed)) * 100) : null;

      return new Response(JSON.stringify({
        total_addresses: addresses.count ?? 0,
        addresses_by_status: statusCounts,
        total_deliveries: deliveries.count ?? 0,
        deliveries_success_rate: successRate,
        field_records_pending: fieldPending.count ?? 0,
        kyc_pending: kycPending.count ?? 0,
      }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "acao desconhecida" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
