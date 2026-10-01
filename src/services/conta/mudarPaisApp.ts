import { supabase } from '@/api/supabase';
import { estaOnline } from '@/services/rede/conectividade';
import { selecionarPais } from '@/state/pais';

import { criarMudarPais } from './mudarPais';

/** Mudar o país da conta, ligado ao Supabase e ao estado do telemóvel. */
export const mudarPaisDaConta = criarMudarPais({
  estaOnline,
  async pedirAoServidor(codigo) {
    const { error } = await supabase.rpc('mudar_pais_da_conta', { p_pais: codigo });
    if (error) throw new Error(error.message);
  },
  async atualizarSessao() {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw new Error(error.message);
  },
  aplicarNoTelemovel: (codigo) => selecionarPais(codigo),
});
