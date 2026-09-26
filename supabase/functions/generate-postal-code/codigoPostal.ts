// Angola Localiza - Código Postal Digital: contas puras (sem Deno, sem base de dados).
// Usado pela Edge Function (index.ts) E pelos testes da app, para a app e o
// servidor calcularem sempre o mesmo. Não importar nada aqui.
//
// Formato: AO-{PROV}-{GRID8}[-{N}]-{CHK}
//   PROV : 3 primeiras letras do nome da província, em maiúsculas; "XXX" se não veio.
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
//   - a sigla da província é a mesma do esquema 1 (3 primeiras letras do nome).

export const SCHEME_VERSION = 2;
export const GRID_LENGTH = 8;

/** Alfabeto do esquema 1 (31 símbolos, sem I, L, O, 0, 1). Só para o controlo. */
export const ALFABETO_CONTROLO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** Alfabeto da grelha: o do esquema 1 + "L" no fim (32 símbolos = 5 bits). */
export const ALFABETO_GRELHA = ALFABETO_CONTROLO + "L";

export const SIGLA_DESCONHECIDA = "XXX";
/** Siglas de província: letras latinas, incluindo os acentos presentes nos nomes oficiais. */
export const PADRAO_SIGLA_PROVINCIA = "[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{3}";

/**
 * Sigla da província: as 3 primeiras letras do nome, em maiúsculas (como no
 * esquema 1); "XXX" se o nome não veio. Nota: nomes com acento na 2.ª ou 3.ª
 * letra (ex.: "Uíge" → "UÍG") devem continuar a ser aceites pelo validador.
 */
export function siglaProvincia(nome: string | null | undefined): string {
  return nome ? nome.substring(0, 3).toUpperCase() : SIGLA_DESCONHECIDA;
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
  const match = code.match(new RegExp(`^AO-(${PADRAO_SIGLA_PROVINCIA})-([2-9A-HJ-NP-Z]{8})(?:-(\\d+))?-(\\d{2})// Angola Localiza - Código Postal Digital: contas puras (sem Deno, sem base de dados).
// Usado pela Edge Function (index.ts) E pelos testes da app, para a app e o
// servidor calcularem sempre o mesmo. Não importar nada aqui.
//
// Formato: AO-{PROV}-{GRID8}[-{N}]-{CHK}
//   PROV : 3 primeiras letras do nome da província, em maiúsculas; "XXX" se não veio.
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
//   - a sigla da província é a mesma do esquema 1 (3 primeiras letras do nome).

export const SCHEME_VERSION = 2;
export const GRID_LENGTH = 8;

/** Alfabeto do esquema 1 (31 símbolos, sem I, L, O, 0, 1). Só para o controlo. */
export const ALFABETO_CONTROLO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** Alfabeto da grelha: o do esquema 1 + "L" no fim (32 símbolos = 5 bits). */
export const ALFABETO_GRELHA = ALFABETO_CONTROLO + "L";

export const SIGLA_DESCONHECIDA = "XXX";
/** Siglas de província: letras latinas, incluindo os acentos presentes nos nomes oficiais. */
export const PADRAO_SIGLA_PROVINCIA = "[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{3}";

/**
 * Sigla da província: as 3 primeiras letras do nome, em maiúsculas (como no
 * esquema 1); "XXX" se o nome não veio. Nota: nomes com acento na 2.ª ou 3.ª
 * letra (ex.: "Uíge" → "UÍG") devem continuar a ser aceites pelo validador.
 */
export function siglaProvincia(nome: string | null | undefined): string {
  return nome ? nome.substring(0, 3).toUpperCase() : SIGLA_DESCONHECIDA;
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
  ));
  if (!match) return { valid: false, reason: "formato invalido" };
  const [, provinceCode, gridCode, , chk] = match;
  const expected = checksum(`${provinceCode}-${gridCode}`);
  if (expected !== chk) return { valid: false, reason: "checksum nao confere" };
  return { valid: true };
}
