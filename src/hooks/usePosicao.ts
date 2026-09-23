import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export interface Posicao {
  latitude: number;
  longitude: number;
  /** Precisão em metros (raio), se o GPS a der. */
  precisao: number | null;
  /** Quando foi lida (ms desde 1970). */
  hora: number;
}

export type EstadoPosicao =
  | { estado: 'a_pedir' }
  | { estado: 'sem_permissao' }
  | { estado: 'gps_desligado' }
  | { estado: 'a_procurar'; ultima: Posicao | null }
  | { estado: 'ok'; posicao: Posicao };

function dePosicao(l: Location.LocationObject): Posicao {
  return {
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    precisao: typeof l.coords.accuracy === 'number' ? l.coords.accuracy : null,
    hora: l.timestamp,
  };
}

/**
 * Posição do GPS enquanto o ecrã está aberto (funciona sem rede).
 * `tentarDeNovo()` volta a pedir a permissão ou a ligar o GPS.
 */
export function usePosicao(): EstadoPosicao & { tentarDeNovo(): void } {
  const [estado, setEstado] = useState<EstadoPosicao>({ estado: 'a_pedir' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    let subscricao: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!ativo) return;
      if (status !== 'granted') return setEstado({ estado: 'sem_permissao' });
      if (!(await Location.hasServicesEnabledAsync())) return ativo && setEstado({ estado: 'gps_desligado' });
      const ultima = await Location.getLastKnownPositionAsync().catch(() => null);
      if (!ativo) return;
      setEstado({ estado: 'a_procurar', ultima: ultima ? dePosicao(ultima) : null });
      // Uma leitura por segundo, mesmo parado (distanceInterval 0): a captura
      // (useCapturaGps) precisa de várias leituras seguidas para fazer a média.
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (l) => ativo && setEstado({ estado: 'ok', posicao: dePosicao(l) }),
        () => ativo && setEstado((e) => (e.estado === 'ok' ? e : { estado: 'gps_desligado' })),
      );
      if (ativo) subscricao = s;
      else s.remove();
    })().catch(() => {
      if (ativo) setEstado({ estado: 'gps_desligado' });
    });
    return () => {
      ativo = false;
      subscricao?.remove();
    };
  }, [tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return { ...estado, tentarDeNovo };
}
