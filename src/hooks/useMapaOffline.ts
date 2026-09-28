import { useEffect, useSyncExternalStore } from 'react';

import { mapaHuambo, type EstadoMapaOffline } from '@/services/mapas/mapaOffline';

const SEM_MAPA: EstadoMapaOffline = { estado: 'sem_mapa', remoto: null };

/** Estado do pacote offline da região atualmente suportada. Nunca inicializa Huambo para outro país. */
export function useMapaOffline(online: boolean | null, paisCodigo = 'AO'): EstadoMapaOffline {
  const ativo = paisCodigo.toUpperCase() === 'AO';
  const estado = useSyncExternalStore(mapaHuambo.estado.subscrever, mapaHuambo.estado.obter, mapaHuambo.estado.obter);
  useEffect(() => {
    if (ativo) void mapaHuambo.iniciar();
  }, [ativo]);
  useEffect(() => {
    if (ativo && online) void mapaHuambo.verificarRemoto();
  }, [ativo, online]);
  return ativo ? estado : SEM_MAPA;
}
