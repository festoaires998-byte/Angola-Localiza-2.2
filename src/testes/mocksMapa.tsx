/**
 * Substitutos do mapa nativo (MapLibre) e do mapa offline para os testes dos
 * ecrãs. Usar dentro de jest.mock(..., () => require('@/testes/mocksMapa').X).
 */
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { View } from 'react-native';

/** Pedidos feitos à câmara do mapa (ex.: flyTo para um ponto encontrado). */
export const chamadasCamara: { metodo: string; args: unknown[] }[] = [];

export const maplibre = {
  // O estilo fica nas props da View, para os testes verem que mapa está a ser mostrado.
  Map: ({ children, mapStyle }: { children?: ReactNode; mapStyle?: unknown }) => (
    <View testID="mapa-nativo" {...({ mapStyle } as object)}>
      {children}
    </View>
  ),
  Camera: forwardRef(function Camera(_props: object, ref) {
    useImperativeHandle(ref, () => ({
      flyTo: (...args: unknown[]) => chamadasCamara.push({ metodo: 'flyTo', args }),
    }));
    return null;
  }),
  NativeUserLocation: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <View testID="marcador">{children}</View>,
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
