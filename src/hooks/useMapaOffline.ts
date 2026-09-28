import { useEffect, useSyncExternalStore } from 'react';

import { criarMapaDoPais, type EstadoMapaOffline } from '@/services/mapas/mapaOffline';

const SEM_MAPA: EstadoMapaOffline = { estado: 'sem_mapa', remoto: null };

export function useMapaOffline(online: boolean | null, paisCodigo = 'AO'): EstadoMapaOffline {
  const gestor = criarMapaDoPais(paisCodigo.toUpperCase() as any);
  const estado = useSyncExternalStore(gestor.estado.subscrever, gestor.estado.obter, gestor.estado.obter);
  useEffect(() => {
    void gestor.iniciar();
  }, [gestor]);
  useEffect(() => {
    if (online) void gestor.verificarRemoto();
  }, [gestor, online]);
  return estado ?? SEM_MAPA;
}
