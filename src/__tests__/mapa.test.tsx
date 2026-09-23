import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { encode } from '@/domain/enderecamento/plusCode';
import type { InfoLocal } from '@/services/location/infoLocal';
import type { EstadoMapaOffline } from '@/services/mapas/mapaOffline';

jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual<typeof import('@/testes/mocksMapa')>('@/testes/mocksMapa').maplibre);

const mockDescarregar = jest.fn(async () => undefined);
jest.mock('@/services/mapas/mapaOffline', () => ({
  mapaHuambo: {
    descarregar: () => mockDescarregar(),
    urlTiles: (m: { ficheiro: string }, local: boolean) => `pmtiles://${local ? 'file:///m' : 'https://s'}/${m.ficheiro}`,
    origemRecursos: () => ({ fontes: 'file:///f', sprite: 'file:///s' }),
  },
}));

let mockOnline: boolean | null = false;
let mockGps: Record<string, unknown> = { estado: 'a_procurar', ultima: null };
let mockInfo: InfoLocal | null = null;
let mockMapa: EstadoMapaOffline = { estado: 'sem_mapa', remoto: null };
const mockTentarDeNovo = jest.fn();
const mockMedirDeNovo = jest.fn();
let mockMedida: Record<string, unknown> = {};
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
jest.mock('@/hooks/usePosicao', () => ({ usePosicao: () => ({ ...mockGps, tentarDeNovo: mockTentarDeNovo }) }));
jest.mock('@/hooks/useCapturaGps', () => ({ useCapturaGps: () => ({ ...mockMedida, medirDeNovo: mockMedirDeNovo }) }));
jest.mock('@/hooks/useInfoLocal', () => ({ useInfoLocal: () => mockInfo }));
jest.mock('@/hooks/useMapaOffline', () => ({ useMapaOffline: () => mockMapa }));

const Mapa = (require('@/app/(tabs)/mapa') as { default: () => React.JSX.Element }).default;

const POS = { latitude: -12.7761, longitude: 15.7392, precisao: 6.2, hora: 0 };
/** Posição medida com 3 leituras (o que o useCapturaGps devolve). */
function medida(p: typeof POS, extra: Record<string, unknown> = {}) {
  return {
    captura: { latitude: p.latitude, longitude: p.longitude, precisao: p.precisao, leituras: 3, fraca: false },
    aMedir: false,
    leiturasBoas: 0,
    necessarias: 3,
    limite: 10,
    melhorAteAgora: null,
    ...extra,
  };
}
const MANIFESTO = { regiao: 'huambo', versao: '20260923', ficheiro: 'huambo-20260923.pmtiles', bytes: 12_582_912 };

function desenhar() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Mapa />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockOnline = false;
  mockGps = { estado: 'ok', posicao: POS };
  mockMedida = medida(POS);
  mockInfo = null;
  mockMapa = { estado: 'sem_mapa', remoto: null };
  mockDescarregar.mockClear();
  mockTentarDeNovo.mockClear();
  mockMedirDeNovo.mockClear();
});

describe('separador Mapa', () => {
  test('sem rede: Plus Code, precisão, código provisório e província guardada', () => {
    mockInfo = {
      plusCode: encode(POS.latitude, POS.longitude),
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-41', estado: 'provisorio', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'guardado', atualizadoEm: '2026-09-20T10:00:00.000Z' },
    };
    desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
    expect(encode(POS.latitude, POS.longitude).replace('+', '')).toHaveLength(11);
    expect(screen.getByText('± 6 m (boa)')).toBeTruthy();
    expect(screen.getByText('Média de 3 leituras do GPS com menos de ±10 m.')).toBeTruthy();
    expect(screen.queryByText(/Pouco preciso/)).toBeNull();
    expect(screen.getByText('AO-HUA-MNFQR6JW-41')).toBeTruthy();
    expect(screen.getByText('Provisório')).toBeTruthy();
    expect(screen.getByText('Calculado neste telemóvel. É confirmado quando houver rede.')).toBeTruthy();
    expect(screen.getAllByText('Huambo')).toHaveLength(2);
    expect(screen.getByText(/Sem rede: guardado a/)).toBeTruthy();
    expect(screen.getByText('Sem rede: a mostrar o que está neste telemóvel')).toBeTruthy();
    // Sem mapa guardado e sem rede: explica, e não oferece a descarga.
    expect(screen.getByText('O mapa ainda não está neste telemóvel. Liga-te à internet para o descarregar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Descarregar mapa' })).toBeNull();
  });

  test('com rede: código confirmado', () => {
    mockOnline = true;
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-2-41', estado: 'confirmado', confirmadoEm: '2026-09-23T21:16:00.000Z' },
      local: { provincia: 'Huambo', municipio: 'Caála', origem: 'servidor', atualizadoEm: null },
    };
    desenhar();
    expect(screen.getByText('Confirmado')).toBeTruthy();
    expect(screen.getByText('Caála')).toBeTruthy();
    expect(screen.queryByText('Sem rede: a mostrar o que está neste telemóvel')).toBeNull();
  });

  test('sem rede, com código já confirmado nesta célula: mostra o confirmado e a data', () => {
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQPN2S-3-95', estado: 'confirmado', confirmadoEm: '2026-09-23T20:16:00.000Z' },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'guardado', atualizadoEm: '2026-09-23T20:16:00.000Z' },
    };
    desenhar();
    expect(screen.getByText('AO-HUA-MNFQPN2S-3-95')).toBeTruthy();
    expect(screen.getByText('Confirmado')).toBeTruthy();
    expect(screen.getByText(/Sem rede: confirmado pelo servidor a/)).toBeTruthy();
    expect(screen.queryByText('Provisório')).toBeNull();
  });

  test('código indisponível', () => {
    mockInfo = { plusCode: '', codigoPostal: { codigo: null, estado: 'indisponivel', confirmadoEm: null }, local: { provincia: null, municipio: null, origem: null, atualizadoEm: null } };
    desenhar();
    expect(screen.getByText('Indisponível neste ponto.')).toBeTruthy();
    expect(screen.getByText('Sem rede e sem dados guardados desta zona.')).toBeTruthy();
  });

  test('com rede e sem mapa guardado: mostra o tamanho e descarrega', () => {
    mockOnline = true;
    mockMapa = { estado: 'sem_mapa', remoto: MANIFESTO };
    desenhar();
    expect(screen.getByText(/\(12,0 MB\)/)).toBeTruthy();
    // Já mostra o mapa pela rede, com a atribuição do OpenStreetMap.
    expect(screen.getByTestId('mapa-nativo')).toBeTruthy();
    expect(screen.getByText('© OpenStreetMap')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Descarregar mapa' }));
    expect(mockDescarregar).toHaveBeenCalledTimes(1);
  });

  test('mapa guardado: abre sem rede, com "© OpenStreetMap"', () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    desenhar();
    expect(screen.getByTestId('mapa-nativo')).toBeTruthy();
    expect(screen.getByText('© OpenStreetMap')).toBeTruthy();
    expect(screen.queryByText(/Descarrega o mapa/)).toBeNull();
  });

  test('a descarregar: mostra a percentagem', () => {
    mockOnline = true;
    mockMapa = { estado: 'a_descarregar', progresso: 0.42, remoto: MANIFESTO };
    desenhar();
    expect(screen.getByText('42% de 12,0 MB')).toBeTruthy();
  });

  test('sem autorização de localização: explica e deixa pedir outra vez', () => {
    mockGps = { estado: 'sem_permissao' };
    desenhar();
    expect(screen.getByText(/Sem autorização para usar a localização/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Autorizar localização' }));
    expect(mockTentarDeNovo).toHaveBeenCalled();
  });

  test('fora do Huambo: avisa que o código continua a funcionar', () => {
    const luanda = { ...POS, latitude: -8.8383, longitude: 13.2344 };
    mockGps = { estado: 'ok', posicao: luanda };
    mockMedida = medida(luanda);
    desenhar();
    expect(screen.getByText(/Estás fora da zona do mapa/)).toBeTruthy();
  });

  test('a medir pela primeira vez: mostra as leituras e ainda não mostra código', () => {
    mockMedida = { captura: null, aMedir: true, leiturasBoas: 2, necessarias: 3, limite: 10, melhorAteAgora: 7.6 };
    desenhar();
    expect(screen.getByText('A medir a tua posição… leitura 2 de 3 com menos de ±10 m. Fica parado uns segundos.')).toBeTruthy();
    expect(screen.getByText('Melhor até agora: ± 8 m.')).toBeTruthy();
    expect(screen.queryByText('Plus Code')).toBeNull();
  });

  test('sem sinal do GPS: pede para ir para um sítio aberto', () => {
    mockGps = { estado: 'a_procurar', ultima: null };
    mockMedida = { captura: null, aMedir: true, leiturasBoas: 0, necessarias: 3, limite: 10, melhorAteAgora: null };
    desenhar();
    expect(screen.getByText(/A procurar o sinal do GPS/)).toBeTruthy();
  });

  test('o código usa a posição medida, não a leitura ao vivo', () => {
    // A leitura ao vivo saltou 15 m; o código continua o da média.
    mockGps = { estado: 'ok', posicao: { ...POS, latitude: POS.latitude + 0.000135 } };
    desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
  });

  test('a medir de novo: mantém o código anterior e diz que está a medir', () => {
    mockMedida = medida(POS, { aMedir: true, leiturasBoas: 1 });
    desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
    expect(screen.getByText('A medir de novo… leitura 1 de 3.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Medir de novo' })).toBeNull();
  });

  test('botão "Medir de novo"', () => {
    desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Medir de novo' }));
    expect(mockMedirDeNovo).toHaveBeenCalledTimes(1);
  });

  test('acima de 10 m: mostra o código com "Pouco preciso" e o aviso, e continua a medir', () => {
    mockMedida = medida(POS, { captura: { ...POS, precisao: 15, leituras: 3, fraca: true }, aMedir: true, leiturasBoas: 1 });
    desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
    expect(screen.getByText('Pouco preciso (± 15 m)')).toBeTruthy();
    expect(screen.getByText('A tentar ter 3 leituras com menos de ±10 m… (1 de 3)')).toBeTruthy();
    expect(screen.getByText(/Precisão acima de 10 m: o código pode não ser o deste ponto/)).toBeTruthy();
  });

  test('acima de 10 m: o código fica "Provisório" e explica porque não está confirmado', () => {
    mockOnline = true;
    mockMedida = medida(POS, { captura: { ...POS, precisao: 18, leituras: 3, fraca: true }, aMedir: true });
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-41', estado: 'provisorio', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'servidor', atualizadoEm: null },
    };
    desenhar();
    expect(screen.getByText('Provisório')).toBeTruthy();
    expect(screen.getByText('Por confirmar: a precisão tem de ser melhor que ±10 m.')).toBeTruthy();
    expect(screen.queryByText('A confirmar com o servidor…')).toBeNull();
  });
});
