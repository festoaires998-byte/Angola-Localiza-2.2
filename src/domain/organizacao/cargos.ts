/**
 * Cargos (RBAC) e que separadores cada utilizador pode abrir.
 * Regras puras: não fazem pedidos à rede nem leem a base de dados.
 */

export const CARGOS = [
  'super_admin',
  'admin_nacional',
  'admin_provincial',
  'admin_municipal',
  'tecnico_campo',
  'supervisor',
  'operador_postal',
  'auditor',
  'empresa',
  'estafeta',
] as const;
export type Cargo = (typeof CARGOS)[number];

/** Separadores da app, pela ordem em que aparecem. */
export const SEPARADORES = [
  'mapa',
  'guardados',
  'entrega',
  'minhas-entregas',
  'campo',
  'validar',
  'admin',
  'definicoes',
] as const;
export type Separador = (typeof SEPARADORES)[number];

/** Estado KYC que abre as funções de staff. */
export const KYC_VERIFICADO = 'ID_VERIFIED';

/** Nível de garantia da sessão (AAL1 = só palavra-passe, AAL2 = com código MFA). */
export type NivelGarantia = 'aal1' | 'aal2';

/** O que qualquer pessoa vê, mesmo sem nada confirmado. */
export const SEPARADORES_MINIMOS: readonly Separador[] = ['mapa', 'definicoes'];

const DO_CIDADAO: readonly Separador[] = ['guardados', 'entrega', 'minhas-entregas'];

const POR_CARGO: Partial<Record<Cargo, readonly Separador[]>> = {
  tecnico_campo: ['campo', 'guardados'],
  estafeta: ['minhas-entregas'],
  operador_postal: ['minhas-entregas'],
  supervisor: ['validar', 'guardados'],
  admin_municipal: ['validar', 'admin'],
  admin_provincial: ['validar', 'admin'],
  admin_nacional: ['validar', 'admin'],
  auditor: ['admin'],
};

export function eCargo(valor: unknown): valor is Cargo {
  return typeof valor === 'string' && (CARGOS as readonly string[]).includes(valor);
}

/** Tira repetidos e valores que não são cargos conhecidos. */
export function normalizarCargos(valores: readonly unknown[]): Cargo[] {
  return CARGOS.filter((c) => valores.includes(c));
}

function porOrdem(conjunto: Set<Separador>): Separador[] {
  return SEPARADORES.filter((s) => conjunto.has(s));
}

/**
 * Separadores permitidos pelos cargos e pelo KYC (as mesmas regras do site):
 * - super_admin → todos;
 * - sempre: mapa e definicoes;
 * - sem cargos (cidadão) → mais guardados, entrega e minhas-entregas
 *   (o cidadão nunca é bloqueado por KYC);
 * - staff com KYC diferente de "ID_VERIFIED" → só mapa e definicoes;
 * - staff verificado → os separadores de cada cargo que tem.
 */
export function separadoresPermitidos(
  cargos: readonly Cargo[],
  estadoKyc: string | null | undefined,
): Separador[] {
  if (cargos.includes('super_admin')) return [...SEPARADORES];
  const permitidos = new Set<Separador>(SEPARADORES_MINIMOS);
  if (cargos.length === 0) {
    DO_CIDADAO.forEach((s) => permitidos.add(s));
    return porOrdem(permitidos);
  }
  if (estadoKyc !== KYC_VERIFICADO) return porOrdem(permitidos);
  for (const cargo of cargos) POR_CARGO[cargo]?.forEach((s) => permitidos.add(s));
  return porOrdem(permitidos);
}

/** Qualquer utilizador com cargos tem de usar MFA. */
export function exigeMfa(cargos: readonly Cargo[]): boolean {
  return cargos.length > 0;
}

/** Perfil confirmado pelo servidor (agora ou numa vez anterior). */
export interface PerfilConfirmado {
  /** Cargos como vieram do servidor (podem incluir cargos que esta versão não conhece). */
  cargos: readonly string[];
  estadoKyc: string | null;
}

export interface EntradaAcesso {
  /**
   * Último perfil confirmado pelo servidor. Quando o pedido de agora falha,
   * é o que ficou guardado; null se nunca houve nenhum.
   */
  perfil: PerfilConfirmado | null;
  /** Nível da sessão atual; null se não for possível saber. */
  nivel: NivelGarantia | null;
  /** O utilizador já tem um fator MFA verificado? null se não se sabe. */
  temFatorMfa?: boolean | null;
}

export type MotivoRestricao = 'sem_perfil' | 'cargo_desconhecido' | 'falta_mfa' | 'kyc';

export interface DecisaoAcesso {
  separadores: Separador[];
  /** Falta verificar o código MFA (ou inscrever-se) para abrir o resto. */
  faltaMfa: boolean;
  /** O que o utilizador tem de fazer a seguir, se exigir MFA. */
  passoMfa: 'verificar' | 'inscrever' | null;
  /** Porque é que está limitado a mapa e definicoes (null se não está). */
  restricao: MotivoRestricao | null;
}

/**
 * Decide os separadores com a regra "falhar fechado":
 * - sem perfil confirmado (nunca houve) → só mapa e definicoes;
 * - cargos que esta versão da app não conhece são ignorados; os conhecidos
 *   aplicam-se normalmente. Se só tiver cargos desconhecidos → só mapa e
 *   definicoes (nunca é tratado como cidadão, que abriria mais);
 * - exige MFA e a sessão não é AAL2 (ou não se sabe) → só mapa e definicoes;
 * - caso contrário, separadoresPermitidos() do último perfil confirmado.
 * Nunca abre mais do que o último estado confirmado.
 */
export function decidirAcesso(entrada: EntradaAcesso): DecisaoAcesso {
  const { perfil, nivel } = entrada;
  if (!perfil) {
    return { separadores: [...SEPARADORES_MINIMOS], faltaMfa: false, passoMfa: null, restricao: 'sem_perfil' };
  }
  const cargos = normalizarCargos(perfil.cargos);
  if (cargos.length === 0 && perfil.cargos.length > 0) {
    return {
      separadores: [...SEPARADORES_MINIMOS],
      faltaMfa: false,
      passoMfa: null,
      restricao: 'cargo_desconhecido',
    };
  }
  if (exigeMfa(cargos) && nivel !== 'aal2') {
    return {
      separadores: [...SEPARADORES_MINIMOS],
      faltaMfa: true,
      passoMfa: entrada.temFatorMfa === false ? 'inscrever' : 'verificar',
      restricao: 'falta_mfa',
    };
  }
  const separadores = separadoresPermitidos(cargos, perfil.estadoKyc);
  const bloqueadoKyc =
    cargos.length > 0 && !cargos.includes('super_admin') && perfil.estadoKyc !== KYC_VERIFICADO;
  return { separadores, faltaMfa: false, passoMfa: null, restricao: bloqueadoKyc ? 'kyc' : null };
}
