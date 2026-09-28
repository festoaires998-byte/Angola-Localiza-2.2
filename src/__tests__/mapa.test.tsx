import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ResultadoPesquisa } from '@/domain/enderecamento/pesquisa';
import type { NovoFavoritoComMorada } from '@/services/moradas/moradas';
import { chamadasCamara } from '@/testes/mocksMapa';

import { limitesCelula } from '@/domain/enderecamento/codigoPostal';
import { encode } from '@/domain/enderecamento/plusCode';
import type { InfoLocal } from '@/services/location/infoLocal';
import type { EstadoMapaOffline } from '@/services/mapas/mapaOffline';

jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual<typeof import('@/testes/mocksMapa')>('@/testes/mocksMapa').maplibre);

const mockDescarregar = jest.fn(async () => undefined);
jest.mock('@/services/mapas/mapaOffline', () => ({
  criarMapaDoPais: () => ({
    estado: { obter: () => mockMapa, subscrever: () => () => undefined },
    iniciar: async () => undefined,
    verificarRemoto: async () => null,
    descarregar: () => mockDescarregar(),
    urlTiles: (m: { ficheiro: string }, local: boolean) => `pmtiles://${local ? 'file:///m' : 'https://s'}/${m.ficheiro}`,
    origemRecursos: () => ({ fontes: 'file:///f', sprite: 'file:///s' }),
  }),
}));

let mockOnline: boolean | null = false;
let mockGps: Record<string, unknown> = { estado: 'a_procurar', ultima: null };
let mockInfo: InfoLocal | null = null;
let mockMapa: EstadoMapaOffline = { estado: 'sem_mapa', remoto: null };
const mockTentarDeNovo = jest.fn();