/**
 * Substitutos do mapa nativo (MapLibre) e do mapa offline para os testes dos
 * ecrãs. Usar dentro de jest.mock(..., () => require('@/testes/mocksMapa').X).
 */
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { View } from 'react-native';

export const chamadasCamara: { metodo: string; args: unknown[] }[] = [];
/** As últimas props da câmara e do personagem (para ver o seguimento e a seta). */
export const ultimasProps: { camara: Record<string, unknown>; personagem: Record<string, unknown> | null } = {
  camara: {},
  personagem: null,
};

export const maplibre = {
  Map: ({ children, mapStyle }: { children?: ReactNode; mapStyle?: unknown }) => (
    <View testID="mapa-nativo" {...({ mapStyle } as object)}>
      {children}
    </View>
  ),
  Camera: forwardRef(function Camera(props: Record<string, unknown>, ref) {
    ultimasProps.camara = props;
    useImperativeHandle(ref, () => ({
      setStop: async (...args: unknown[]) => { chamadasCamara.push({ metodo: 'setStop', args }); },
      flyTo: (...args: unknown[]) => chamadasCamara.push({ metodo: 'flyTo', args }),
      zoomTo: (...args: unknown[]) => chamadasCamara.push({ metodo: 'zoomTo', args }),
    }));
    return null;
  }),
  NativeUserLocation: (props: Record<string, unknown>) => {
    ultimasProps.personagem = props;
    return null;
  },
  Marker: ({ children }: { children?: ReactNode }) => <View testID="marcador">{children}</View>,
};

const SEM_MAPA = { estado: 'sem_mapa', remoto: null } as const;

const mapaHuambo = {
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
};

export const criarMapaDoPais = () => mapaHuambo;

export const mapaOffline = {
  criarMapaDoPais,
  mapaHuambo,
};