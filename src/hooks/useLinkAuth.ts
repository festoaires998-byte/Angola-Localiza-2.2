import { useSyncExternalStore } from 'react';

import { estadoLinkAuth, type EstadoLinkAuth } from '@/services/links/tratarLinks';

/** Estado do último link do email (recuperação ou confirmação). */
export function useLinkAuth(): EstadoLinkAuth {
  return useSyncExternalStore(estadoLinkAuth.subscrever, estadoLinkAuth.obter, estadoLinkAuth.obter);
}
