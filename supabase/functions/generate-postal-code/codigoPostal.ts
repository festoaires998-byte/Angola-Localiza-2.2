// Angola Localiza - Código Postal Digital: contas puras (sem Deno, sem base de dados).
// Usado pela Edge Function (index.ts) E pelos testes da app, para a app e o
// servidor calcularem sempre o mesmo. Não importar nada aqui.
//
// Formato: AO-{PROV}-{GRID8}[-{N}]-{CHK}
//   PROV : sigla FIXA da província (tabela SIGLAS_PROVINCIAS); "XXX" se não se sabe.
//   GRID8: 8 caracteres de uma grelha tipo geohash (~38 m x 19 m).
//   N    : (2+) só quando já existe outra morada na mesma célula.
//   CHK  : 2 dígitos de controlo sobre "PROV-GRID8" (não muda com N).
//
// Esquema 2 (em relação ao 1):
//   - a grelha usa 32 símbolos (acrescenta "L" no FIM). No esquema 1 havia só
//     31 e o valor 31 dava "undefined" dentro do código. Os códigos do esquema 1
//     que eram válidos continuam exatamente iguais;
//   - o controlo continua a usar o alfabeto do esquema 1 (os controlos antigos
//     continuam certos);
//   - a sigla deixa de ser "3 primeiras letras do nome" e passa a ser fixa.

export const SCHEME_VERSION = 2;
export const GRID_LENGTH = 8;

/** Alfabeto do esquema 1 (31 símbolos, sem I, L, O, 0, 1). Só para o controlo. */
export const ALFABETO_CONTROLO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** Alfabeto da grelha: o do esquema 1 + "L" no fim (32 símbolos = 5 bits). */
export const ALFABETO_GRELHA = ALFABETO_CONTROLO + "L";

/**
 * Siglas das 21 províncias (divisão de 2024). Códigos ISO 3166-2:AO onde existem;
 * as 4 províncias novas ainda não têm código ISO (siglas propostas, marcadas).
 */
export const SIGLAS_PROVINCIAS: Readonly<Record<string, string>> = {
  "bengo": "BGO",
  "benguela": "BGU",
  "bie": "BIE",
  "cabinda": "CAB",
  "cuando": "CDO", // nova (2024): sem código ISO
  "cubango": "CUB", // nova (2024): sem código ISO
  "cuanza norte": "CNO",
  "cuanza sul": "CUS",
  "cunene": "CNN",
  "huambo": "HUA",
  "huila": "HUI",
  "icolo e bengo": "ICB", // nova (2024): sem código ISO
  "luanda": "LUA",
  "lunda norte": "LNO",
  "lunda sul": "LSU",
  "malanje": "MAL",
  "moxico": "MOX",
  "moxico leste": "MXL", // nova (2024): sem código ISO
  "namibe": "NAM",
  "uige": "UIG",
  "zaire": "ZAI",
};

/** Outras grafias que chegam do mapa (OpenStreetMap / LocationIQ). */
const SINONIMOS: Readonly<Record<string, string>> = {
  "kwanza norte": "cuanza norte",
  "kwanza sul": "cuanza sul",
  "cuando cubango": "cuando cubango", // antiga (antes de 2024): ver SIGLA_CUANDO_CUBANGO
  "kuando kubango": "cuando cubango",
  "kuando": "cuando",
  "kubango": "cubango",
  "malange": "malanje",
  "moxico este": "moxico leste",
};

/**
 * "Cuando Cubango" deixou de existir em 2024 (dividida em Cuando e Cubango),
 * mas o mapa ainda pode devolver o nome antigo. Sem saber de qual das duas se
 * trata, usa-se o código ISO antigo.
 */
export const SIGLA_CUANDO_CUBANGO = "CCU";
export const SIGLA_DESCONHECIDA = "XXX";

/** "Província do Uíge" → "uige"; "Cuanza-Norte" → "cuanza norte". */
export function normalizarProvincia(nome: string): string {
  let n = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  n = n.replace(/^provincia (de |do |da )?/, "");
  return SINONIMOS[n] ?? n;
}

/** Sigla fixa da província; "XXX" se o nome não é conhecido (ou não veio). */
export function siglaProvincia(nome: string | null | undefined): string {
  if (!nome || !nome.trim()) return SIGLA_DESCONHECIDA;
  const n = normalizarProvincia(nome);
  if (n === "cuando cubango") return SIGLA_CUANDO_CUBANGO;
  return SIGLAS_PROVINCIAS[n] ?? SIGLA_DESCONHECIDA;
}

/** Grelha: alterna bits de longitude e latitude, 5 bits por símbolo. */
export function encodeGrid(lat: number, lng: number, length: number = GRID_LENGTH): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, bits = "";
  let isLng = true;
  for (let i = 0; i < length * 5; i++) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { bits += "1"; lngMin = mid; } else { bits += "0"; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { bits += "1"; latMin = mid; } else { bits += "0"; latMax = mid; }
    }
    isLng = !isLng;
  }
  let code = "";
  for (let i = 0; i < bits.length; i += 5) code += ALFABETO_GRELHA[parseInt(bits.substring(i, i + 5).padEnd(5, "0"), 2)];
  return code;
}

/** Controlo de 2 dígitos (igual ao do esquema 1). */
export function checksum(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const idx = ALFABETO_CONTROLO.indexOf(input[i]);
    const val = idx >= 0 ? idx + 1 : input.charCodeAt(i);
    sum = (sum + val * (i + 1)) % 9973;
  }
  return (((sum % 97) + 1)).toString().padStart(2, "0");
}

/** Código sem o "-N" (o que se obtém quando a célula ainda não tem moradas). */
export function codigoBase(latitude: number, longitude: number, provinceName?: string | null) {
  const provinceCode = siglaProvincia(provinceName);
  const gridCode = encodeGrid(latitude, longitude, GRID_LENGTH);
  const base = `${provinceCode}-${gridCode}`;
  const chk = checksum(base);
  return { provinceCode, gridCode, base, checksum: chk, postal_code: `AO-${base}-${chk}` };
}

/** Aceita códigos do esquema 1 e 2 (a sigla só tem de ter 3 letras). */
export function validatePostalCode(code: string): { valid: boolean; reason?: string } {
  const match = code.match(/^AO-([A-Z]{3})-([2-9A-HJ-NP-Z]{8})(?:-(\d+))?-(\d{2})$/);
  if (!match) return { valid: false, reason: "formato invalido" };
  const [, provinceCode, gridCode, , chk] = match;
  const expected = checksum(`${provinceCode}-${gridCode}`);
  if (expected !== chk) return { valid: false, reason: "checksum nao confere" };
  return { valid: true };
}
