/**
 * Substitutos do mapa nativo (MapLibre) e do mapa offline para os testes dos
 * ecrãs. Usar dentro de jest.mock(..., () => require('@/testes/mocksMapa').X).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

export const maplibre = {
  Map: ({ children }: { children?: ReactNode }) => <View testID="mapa-nativo">{children}</View>,
  Camera: () => null,
  NativeUserLocation: () => null,
};

// O mesmo objeto sempre (useSyncExternalStore exige que não mude sem motivo).
const SEM_MAPA = { estado: 'sem_mapa', remoto: null } as const;

export const mapaOffline = {
  mapaHuambo: {
    estado: {
      obter: () => SEM_MAPA,
      subscrever: () => () => undefined,
      definir: () => undefined,
    },
    iniciar: async () => undefined,
    verificarRemoto: async () => null,
    descarregar: async () => undefined,
    urlTiles: () => 'pmtiles://file:///x.pmtiles',
    origemRecursos: () => ({ fontes: 'file:///f', sprite: 'file:///s' }),
  },
};
