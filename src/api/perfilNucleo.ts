import type { PerfilLocal } from '@/database/repositories/perfilLocal';

/** Parte de carregarPerfil() sem rede nem Supabase (testável). */

export interface UtilizadorSessao {
  id: string;
  email: string | null;
  /** Nome completo da conta (user_metadata.full_name); null se ainda não tem. */
  nome?: string | null;
}

export interface ResultadoPerfil {
  utilizador: UtilizadorSessao;
  /** Último perfil confirmado pelo servidor (agora ou antes). null se nunca houve. */
  perfil: PerfilLocal | null;
  /** true se foi confirmado agora; false se é o guardado ("não confirmado agora"). */
  confirmadoAgora: boolean;
  /** Porque não foi possível confirmar agora (null se correu bem). */
  erro: string | null;
}

export interface DependenciasPerfil {
  /** Cargos (texto) do utilizador em organization_members. */
  lerCargos(userId: string): Promise<string[]>;
  /** Estado KYC (identity-kyc?action=status). */
  lerEstadoKyc(): Promise<string | null>;
  perfis: {
    obter(userId: string): Promise<PerfilLocal | null>;
    guardar(perfil: Omit<PerfilLocal, 'confirmado_em'>): Promise<PerfilLocal>;
  };
}

/**
 * Lê cargos e KYC do servidor e guarda-os em perfil_local.
 * O KYC só é pedido para staff que não seja super_admin (o cidadão não precisa
 * e o super_admin não é bloqueado por KYC).
 * Se alguma parte falhar, não grava nada e devolve o último perfil guardado,
 * marcado como não confirmado agora.
 */
export async function carregarPerfilCom(
  deps: DependenciasPerfil,
  utilizador: UtilizadorSessao,
): Promise<ResultadoPerfil> {
  try {
    const cargos = [...new Set(await deps.lerCargos(utilizador.id))];
    const staffComKyc = cargos.length > 0 && !cargos.includes('super_admin');
    const estadoKyc = staffComKyc ? await deps.lerEstadoKyc() : null;
    const perfil = await deps.perfis.guardar({
      user_id: utilizador.id,
      email: utilizador.email,
      cargos,
      estado_kyc: estadoKyc,
    });
    return { utilizador, perfil, confirmadoAgora: true, erro: null };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    let guardado: PerfilLocal | null = null;
    try {
      guardado = await deps.perfis.obter(utilizador.id);
    } catch {
      guardado = null;
    }
    return { utilizador, perfil: guardado, confirmadoAgora: false, erro: mensagem };
  }
}
