import { abrirBaseDados } from '@/database/client';
import { criarRepositorioPerfilLocal } from '@/database/repositories/perfilLocal';
import { nomeDaConta } from '@/domain/identidade/nome';

import { chamarFuncao } from './edge/chamarFuncao';
import { carregarPerfilCom, type ResultadoPerfil } from './perfilNucleo';
import { supabase } from './supabase';

export { carregarPerfilCom } from './perfilNucleo';
export type { DependenciasPerfil, ResultadoPerfil, UtilizadorSessao } from './perfilNucleo';

async function lerCargos(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', userId);
  if (error) throw new Error(error.message || 'Não foi possível ler os cargos.');
  return (data ?? [])
    .map((linha: { role?: unknown }) => linha.role)
    .filter((r): r is string => typeof r === 'string' && r !== '');
}

async function lerEstadoKyc(): Promise<string | null> {
  const r = await chamarFuncao<{ status?: unknown }>('identity-kyc', 'status');
  if (typeof r?.status !== 'string') throw new Error('Resposta do KYC sem estado.');
  return r.status;
}

/**
 * Carrega o perfil do utilizador com sessão. Devolve null se não houver sessão.
 * Não precisa de rede para devolver o último perfil guardado.
 */
export async function carregarPerfil(): Promise<ResultadoPerfil | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const db = await abrirBaseDados();
  return carregarPerfilCom(
    { lerCargos, lerEstadoKyc, perfis: criarRepositorioPerfilLocal(db) },
    { id: user.id, email: user.email ?? null, nome: nomeDaConta(user.user_metadata) },
  );
}
