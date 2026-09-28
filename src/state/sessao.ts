import { nivelGarantia } from '@/api/auth';
import { carregarPerfil } from '@/api/perfil';
import { supabase } from '@/api/supabase';
import { abrirBaseDados } from '@/database/client';
import { nomeDaConta } from '@/domain/identidade/nome';
import { criarRepositorioPerfilLocal } from '@/database/repositories/perfilLocal';

import { criarSessao } from './criarSessao';
import { selecionarPais } from './pais';

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
        const codigo = typeof s?.user?.user_metadata?.country_code === 'string' ? s.user.user_metadata.country_code : 'AO';
        void selecionarPais(codigo).catch(() => undefined);
        ouvinte(s?.user ? { id: s.user.id, email: s.user.email ?? null, nome: nomeDaConta(s.user.user_metadata), countryCode: codigo } : null);
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