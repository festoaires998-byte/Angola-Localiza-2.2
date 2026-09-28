  NativeUserLocation: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <View testID="marcador">{children}</View>,
};

// O mesmo objeto sempre (useSyncExternalStore exige que não mude sem motivo).
const SEM_MAPA = { estado: 'sem_mapa', remoto: null } as const;

export const mapaOffline = {
  criarMapaDoPais: () => mapaOffline.mapaHuambo,
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