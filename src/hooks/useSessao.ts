import { useSyncExternalStore } from 'react';

import { sessao, type EstadoSessao } from '@/state/sessao';

/** Estado completo da sessão: utilizador, perfil, nível MFA e acesso. */
export function useSessao(): EstadoSessao {
  return useSyncExternalStore(sessao.loja.subscrever, sessao.loja.obter, sessao.loja.obter);
}
