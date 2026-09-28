
/** Os Plus Codes guardados em addresses têm 10 dígitos (ex.: "5FVQ5PWV+PJ"), como o site. */
const PLUS_CODE_DIGITOS = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Igual à generate-postal-code: AO-{PROV}-{GRID8}[-{N}]-{CHK}, com N (2+) só se o código já existir.
async function generatePostalCode(supabase: ReturnType<typeof createClient>, lat: number, lng: number, provinceName?: string, countryCode = 'AO') {
  const { base, checksum: chk } = codigoBase(lat, lng, provinceName, countryCode);
  let candidate = `${countryCode.trim().toUpperCase()}-${base}-${chk}`; let n = 1;
  while (true) { const { data } = await supabase.from("addresses").select("id").eq("postal_code", candidate).maybeSingle(); if (!data) break; n++; candidate = `${countryCode.trim().toUpperCase()}-${base}-${n}-${chk}`; if (n > 20) break; }
  return candidate;
}
function quadraCode(lat: number, lng: number): string { return `Q${Math.floor(lat / 0.001082)}-${Math.floor(lng / 0.001096)}`; }
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nextFreeSuffix(base: string, takenSuffixes: Set<string>): string {
  for (let i = 0; i < 26; i++) { const letter = String.fromCharCode(65 + i); if (!takenSuffixes.has(letter)) return base + letter; }
  return base + "Z9";
}
async function getOrCreateQuadra(supabase: ReturnType<typeof createClient>, lat: number, lng: number) {
  const code = quadraCode(lat, lng);
  const { data: existing } = await supabase.from("quadras").select("id").eq("code", code).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase.from("quadras").insert({ code, kind: "GRID", area_m2: 14400 }).select("id").single();
  if (created?.id) return created.id;
  // Outra requisição pode ter criado a mesma quadra entre o SELECT e o INSERT.
  const { data: raced } = await supabase.from("quadras").select("id").eq("code", code).maybeSingle();
  return raced?.id ?? null;
}
async function getOrCreateStreet(supabase: ReturnType<typeof createClient>, quadraId: string, streetName: string | null, newUnnamed: boolean) {
  if (newUnnamed || !streetName || !streetName.trim()) {
    const { count } = await supabase.from("streets").select("*", { count: "exact", head: true }).eq("quadra_id", quadraId).ilike("name", "Rua S/N% %");