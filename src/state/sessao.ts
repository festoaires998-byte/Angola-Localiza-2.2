import { nivelGarantia } from '@/api/auth';
import { carregarPerfil } from '@/api/perfil';
import { supabase } from '@/api/supabase';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioPerfilLocal } from '@/database/repositories/perfilLocal';

import { criarSessao } from './criarSessao';

export type { EstadoSessao, NivelSessao, UtilizadorSessao } from './criarSessao';

/**
 * Estado da sessão da app (um só).
 * Chamar sessao.iniciar() uma vez no arranque (ex.: no _layout).
 */
export const sessao = criarSessao({
  ouvirSessao(ouvinte) {
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      // A documentação do supabase-js pede para não chamar o cliente dentro
      // deste callback (pode bloquear): o trabalho corre logo a seguir.
      setTimeout(() => {
        ouvinte(s?.user ? { id: s.user.id, email: s.user.email ?? null } : null);
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  },
  nivelGarantia,
  carregarPerfil,
  async perfilGuardado(userId) {
    return criarRepositorioPerfilLocal(await abrirBaseDados()).obter(userId);
  },
});
