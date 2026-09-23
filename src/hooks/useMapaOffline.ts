import { useEffect, useSyncExternalStore } from 'react';

import { mapaHuambo, type EstadoMapaOffline } from '@/services/mapas/mapaOffline';

/**
 * Estado do mapa do Huambo no telemóvel. Ao abrir, vê o que está guardado
 * (sem rede); com rede, lê o manifesto (tamanho / versão nova).
 */
export function useMapaOffline(online: boolean | null): EstadoMapaOffline {
  const estado = useSyncExternalStore(
    mapaHuambo.estado.subscrever,
    mapaHuambo.estado.obter,
    mapaHuambo.estado.obter,
  );
  useEffect(() => {
    void mapaHuambo.iniciar();
  }, []);
  useEffect(() => {
    if (online) void mapaHuambo.verificarRemoto();
  }, [online]);
  return estado;
}
