// Regras puras do preço de uma entrega (sem base de dados).
// CÓPIA EXATA em supabase/functions/pricing/precos.ts e supabase/functions/deliveries/precos.ts: a função "pricing"
// mostra o preço e a "deliveries" regista o mesmo valor quando cria a entrega.
// O teste src/__tests__/pricing.test.ts falha se as duas cópias forem diferentes.

export const ZONAS = ["A", "B", "C"] as const;
export type Zona = (typeof ZONAS)[number];

/** Diferença para UTC (horas) de cada país, sem hora de verão. */
export const FUSO_HORARIO: Record<string, number> = { AO: 1, MZ: 2, CV: -1, GW: 0, ST: 0 };

export function codigoPais(valor: unknown): string {
  return typeof valor === "string" && /^[A-Za-z]{2}$/.test(valor.trim()) ? valor.trim().toUpperCase() : "AO";
}

export function zonaValida(valor: unknown): Zona | null {
  const z = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  return (ZONAS as readonly string[]).includes(z) ? (z as Zona) : null;
}

export interface Territorio {
  municipality_id?: string | null;
  province_id?: string | null;
}

/**
 * Zona da entrega (igual à regra que o site já mostrava):
 * - A: mesmo município;
 * - C: outro município da mesma província;
 * - B: tudo o resto (incluindo quando não se sabe onde fica a recolha).
 */
export function determinarZona(origem: Territorio | null, destino: Territorio | null): Zona {
  const o = origem ?? {};
  const d = destino ?? {};
  if (o.municipality_id && d.municipality_id && o.municipality_id === d.municipality_id) return "A";
  if (o.province_id && d.province_id && o.province_id === d.province_id) return "C";
  return "B";
}

/** Zona pedida (zone_code ou zone_code_hint) ou, se não vier, a calculada. */
export function escolherZona(corpo: Record<string, unknown>, origem: Territorio | null, destino: Territorio | null): { zona: Zona; estimada: boolean } {
  const pedida = zonaValida(corpo.zone_code) ?? zonaValida(corpo.zone_code_hint);
  if (pedida) return { zona: pedida, estimada: false };
  return { zona: determinarZona(origem, destino), estimada: true };
}

/** Hora e dia da semana no país (as funções correm em UTC). */
export function horaLocal(agora: Date, pais: string): { hora: number; dia: number } {
  const local = new Date(agora.getTime() + (FUSO_HORARIO[pais] ?? 0) * 3600_000);
  return { hora: local.getUTCHours(), dia: local.getUTCDay() };
}

/** +20% das 20h às 6h e ao fim de semana, na hora do país. */
export function aplicarSobretaxaHorario(total: number, agora: Date, pais = "AO"): { total: number; surcharge: number } {
  const { hora, dia } = horaLocal(agora, pais);
  const noturnoOuFimDeSemana = hora >= 20 || hora < 6 || dia === 0 || dia === 6;
  if (!noturnoOuFimDeSemana) return { total, surcharge: 0 };
  const surcharge = Math.round(total * 0.2);
  return { total: total + surcharge, surcharge };
}

export interface Tarifas {
  base_fee: number;
  routing_fee: number;
  proof_fee: number;
  bulky_fee: number | null;
  long_wait_fee: number | null;
  currency_code: string;
}

export interface Desconto {
  base_fee?: number | null;
  routing_fee?: number | null;
  proof_fee?: number | null;
  volume_discount_threshold?: number | null;
  volume_discount_routing_fee?: number | null;
}

/** Tarifas da zona com a tabela negociada da organização (e o desconto por volume do mês). */
export function aplicarDesconto(t: Tarifas, d: Desconto | null, entregasNoMes: number): Tarifas {
  if (!d) return t;
  const r = { ...t };
  if (d.base_fee != null) r.base_fee = Number(d.base_fee);
  if (d.proof_fee != null) r.proof_fee = Number(d.proof_fee);
  if (d.volume_discount_threshold) {
    if (d.volume_discount_routing_fee != null && entregasNoMes >= d.volume_discount_threshold) {
      r.routing_fee = Number(d.volume_discount_routing_fee);
    }
  } else if (d.routing_fee != null) {
    r.routing_fee = Number(d.routing_fee);
  }
  return r;
}

export interface Cotacao {
  ok: true;
  currency_code: string;
  breakdown: Record<string, number>;
  amount_total: number;
  amount_driver: number;
  amount_platform: number;
}

/** Preço final: frete + roteamento + prova + extras, com a sobretaxa de horário. */
export function calcularPreco(
  t: Tarifas,
  extras: { volumoso?: boolean; esperaLonga?: boolean },
  agora: Date,
  pais: string,
): Cotacao | { ok: false; erro: string } {
  const breakdown: Record<string, number> = { frete: t.base_fee, roteamento: t.routing_fee, prova: t.proof_fee };
  let subtotal = t.base_fee + t.routing_fee + t.proof_fee;
  if (extras.volumoso) {
    if (t.bulky_fee == null) return { ok: false, erro: "bulky_fee_not_configured" };
    breakdown.volumoso = t.bulky_fee;
    subtotal += t.bulky_fee;
  }
  if (extras.esperaLonga) {
    if (t.long_wait_fee == null) return { ok: false, erro: "long_wait_fee_not_configured" };
    breakdown.espera_longa = t.long_wait_fee;
    subtotal += t.long_wait_fee;
  }
  const { total, surcharge } = aplicarSobretaxaHorario(subtotal, agora, pais);
  if (surcharge) breakdown.noturno_fim_de_semana = surcharge;
  return {
    ok: true,
    currency_code: t.currency_code,
    breakdown,
    amount_total: total,
    amount_driver: t.base_fee,
    amount_platform: total - t.base_fee,
  };
}

/** Linha de country_pricing_zones → Tarifas (números). */
export function tarifasDaLinha(z: Record<string, unknown>): Tarifas {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    base_fee: Number(z.base_fee ?? 0),
    routing_fee: Number(z.routing_fee ?? 0),
    proof_fee: Number(z.proof_fee ?? 0),
    bulky_fee: n(z.bulky_fee),
    long_wait_fee: n(z.long_wait_fee),
    currency_code: typeof z.currency_code === "string" ? z.currency_code : "AOA",
  };
}

/** Um valor de tarifa aceitável na edição (número >= 0), ou undefined se não veio. */
export function valorTarifa(v: unknown): number | undefined | null {
  if (v === undefined || v === null || v === "") return undefined;
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 && x <= 10_000_000 ? x : null;
}
