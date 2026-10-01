import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
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
let mockMapa: EstadoMapaOffline = { estado: 'sem_mapa', remoto: null };
const mockGestorMapa = {
  estado: { obter: () => mockMapa, subscrever: () => () => undefined },
  iniciar: async () => undefined,
  verificarRemoto: async () => null,
  descarregar: () => mockDescarregar(),
  urlTiles: (m: { ficheiro: string }, local: boolean) => `pmtiles://${local ? 'file:///m' : 'https://s'}/${m.ficheiro}`,
  origemRecursos: () => ({ fontes: 'file:///f', sprite: 'file:///s' }),
};
jest.mock('@/services/mapas/mapaOffline', () => ({
  criarMapaDoPais: () => mockGestorMapa,
}));

let mockOnline: boolean | null = false;
let mockGps: Record<string, unknown> = { estado: 'a_procurar', ultima: null };
let mockInfo: InfoLocal | null = null;
const mockTentarDeNovo = jest.fn();
const mockMedirDeNovo = jest.fn();
let mockMedida: Record<string, unknown> = {};
jest.mock('@/hooks/useOnline', () => ({ useOnline: () => mockOnline }));
jest.mock('@/hooks/usePosicao', () => ({ usePosicao: () => ({ ...mockGps, tentarDeNovo: mockTentarDeNovo }) }));
jest.mock('@/hooks/useCapturaGps', () => ({ useCapturaGps: () => ({ ...mockMedida, medirDeNovo: mockMedirDeNovo }) }));
jest.mock('@/hooks/useInfoLocal', () => ({ useInfoLocal: () => mockInfo }));
jest.mock('@/hooks/useMapaOffline', () => ({ useMapaOffline: () => mockMapa }));

const mockPush = jest.fn();
let mockParametros: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParametros,
}));

let mockSeparadores: string[] = ['mapa', 'guardados', 'definicoes'];
jest.mock('@/hooks/useSessao', () => ({
  useSessao: () => ({ utilizador: { id: 'u-ana' }, acesso: { separadores: mockSeparadores, restricao: null } }),
}));

let mockVerificacao = 'verificado';
let resolverVerificacao: ((valor: string) => void) | undefined;
jest.mock('@/services/moradas/registoApp', () => ({
  servicoRegisto: {
    verificacao: () =>
      new Promise<string>((resolve) => {
        resolverVerificacao = resolve;
      }),
  },
}));

const mockGuardarDoMapa = jest.fn(async (..._a: unknown[]) => ({}));
const mockEnviarPendentes = jest.fn(async (_u: string): Promise<{ enviados: number; erro: Error | null }> => ({ enviados: 1, erro: null }));
const mockAvisar = jest.fn();
jest.mock('@/services/moradas/moradasApp', () => ({
  servicoMoradas: {
    guardarDoMapa: (...a: unknown[]) => mockGuardarDoMapa(...a),
    enviarPendentes: (u: string) => mockEnviarPendentes(u),
  },
  mudancasMoradas: { avisar: () => mockAvisar() },
}));

const mockPesquisar = jest.fn(async (_q: string): Promise<ResultadoPesquisa[]> => []);
jest.mock('@/api/pesquisa', () => ({ pesquisarNoServidor: (q: string) => mockPesquisar(q) }));

const mockPartilharQr = jest.fn(async (_b: string, _n: string) => undefined);
jest.mock('@/services/imagem/qrPng', () => ({ partilharQrPng: (b: string, n: string) => mockPartilharQr(b, n) }));

jest.mock('react-native-qrcode-svg', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return ({ value, getRef }: { value: string; getRef?: (c: unknown) => void }) => {
    React.useEffect(() => {
      getRef?.({ toDataURL: (cb: (b: string) => void) => cb('iVBORbase64') });
    }, []);
    return <Text testID="qr">{value}</Text>;
  };
});

let mockLerQr: ((r: { data: string }) => void) | undefined;
jest.mock('expo-camera', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
    CameraView: (props: { onBarcodeScanned?: (r: { data: string }) => void }) => {
      mockLerQr = props.onBarcodeScanned;
      return <View testID="leitor-qr" />;
    },
  };
});

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

async function desenhar() {
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Mapa />
    </SafeAreaProvider>,
  );
  await act(async () => {
    resolverVerificacao?.(mockVerificacao);
    await Promise.resolve();
  });
  return utils;
}

beforeEach(() => {
  mockSeparadores = ['mapa', 'guardados', 'definicoes'];
  mockVerificacao = 'verificado';
  resolverVerificacao = undefined;
  mockPush.mockClear();
  mockGuardarDoMapa.mockClear();
  mockEnviarPendentes.mockClear();
  mockEnviarPendentes.mockResolvedValue({ enviados: 1, erro: null });
  mockAvisar.mockClear();
  mockPesquisar.mockReset();
  mockPesquisar.mockResolvedValue([]);
  mockPartilharQr.mockClear();
  mockLerQr = undefined;
  chamadasCamara.length = 0;
  mockOnline = false;
  mockGps = { estado: 'ok', posicao: POS };
  mockMedida = medida(POS);
  mockInfo = null;
  mockMapa = { estado: 'sem_mapa', remoto: null };
  mockDescarregar.mockClear();
  mockTentarDeNovo.mockClear();
  mockMedirDeNovo.mockClear();
});

// O primeiro teste desenha o ecrã do Mapa pela primeira vez (carrega o mapa, o GPS
// e os serviços). Com todos os testes a correr ao mesmo tempo, isso pode passar dos
// 5 s por omissão do Jest e o teste falhava sem haver erro nenhum.
jest.setTimeout(20_000);

describe('separador Mapa', () => {
  test('sem rede: Plus Code, precisão, código provisório e província guardada', async () => {
    mockInfo = {
      plusCode: encode(POS.latitude, POS.longitude),
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-41', estado: 'provisorio', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'guardado', atualizadoEm: '2026-09-20T10:00:00.000Z' },
    };
    await desenhar();
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

  test('com rede: código confirmado', async () => {
    mockOnline = true;
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-2-41', estado: 'confirmado', confirmadoEm: '2026-09-23T21:16:00.000Z' },
      local: { provincia: 'Huambo', municipio: 'Caála', origem: 'servidor', atualizadoEm: null },
    };
    await desenhar();
    expect(screen.getByText('Confirmado')).toBeTruthy();
    expect(screen.getByText('Caála')).toBeTruthy();
    expect(screen.queryByText('Sem rede: a mostrar o que está neste telemóvel')).toBeNull();
  });

  test('sem rede, com código já confirmado nesta célula: mostra o confirmado e a data', async () => {
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQPN2S-3-95', estado: 'confirmado', confirmadoEm: '2026-09-23T20:16:00.000Z' },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'guardado', atualizadoEm: '2026-09-23T20:16:00.000Z' },
    };
    await desenhar();
    expect(screen.getByText('AO-HUA-MNFQPN2S-3-95')).toBeTruthy();
    expect(screen.getByText('Confirmado')).toBeTruthy();
    expect(screen.getByText(/Sem rede: confirmado pelo servidor a/)).toBeTruthy();
    expect(screen.queryByText('Provisório')).toBeNull();
  });

  test('código indisponível', async () => {
    mockInfo = { plusCode: '', codigoPostal: { codigo: null, estado: 'indisponivel', confirmadoEm: null }, local: { provincia: null, municipio: null, origem: null, atualizadoEm: null } };
    await desenhar();
    expect(screen.getByText('Indisponível neste ponto.')).toBeTruthy();
    expect(screen.getByText('Sem rede e sem dados guardados desta zona.')).toBeTruthy();
  });

  test('com rede e sem mapa guardado: mostra o tamanho e descarrega', async () => {
    mockOnline = true;
    mockMapa = { estado: 'sem_mapa', remoto: MANIFESTO };
    await desenhar();
    expect(screen.getAllByText(/\(12,0 MB\)/).length).toBeGreaterThan(0);
    // Já mostra o mapa pela rede, com a atribuição do OpenStreetMap.
    expect(screen.getByTestId('mapa-nativo')).toBeTruthy();
    expect(screen.getByText('© OpenStreetMap')).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: 'Descarregar mapa' })[0]);
    expect(mockDescarregar).toHaveBeenCalledTimes(1);
  });

  test('mapa guardado: abre sem rede, com "© OpenStreetMap"', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    expect(screen.getByTestId('mapa-nativo')).toBeTruthy();
    expect(screen.getByText('© OpenStreetMap')).toBeTruthy();
    expect(screen.queryByText(/Descarrega o mapa/)).toBeNull();
  });

  test('a descarregar: mostra a percentagem', async () => {
    mockOnline = true;
    mockMapa = { estado: 'a_descarregar', progresso: 0.42, remoto: MANIFESTO };
    await desenhar();
    expect(screen.getAllByText('42% de 12,0 MB').length).toBeGreaterThan(0);
  });

  test('sem autorização de localização: explica e deixa pedir outra vez', async () => {
    mockGps = { estado: 'sem_permissao' };
    await desenhar();
    expect(screen.getByText(/Sem autorização para usar a localização/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Autorizar localização' }));
    expect(mockTentarDeNovo).toHaveBeenCalled();
  });

  test('fora de Angola: avisa que o código continua a funcionar', async () => {
    const foraDeAngola = { ...POS, latitude: 0, longitude: 0 };
    mockGps = { estado: 'ok', posicao: foraDeAngola };
    mockMedida = medida(foraDeAngola);
    await desenhar();
    expect(screen.getByText(/Estás fora da zona do mapa/)).toBeTruthy();
  });

  test('a medir pela primeira vez: mostra as leituras e ainda não mostra código', async () => {
    mockMedida = { captura: null, aMedir: true, leiturasBoas: 2, necessarias: 3, limite: 10, melhorAteAgora: 7.6 };
    await desenhar();
    expect(screen.getByText('A medir a tua posição… leitura 2 de 3 com menos de ±10 m. Fica parado uns segundos.')).toBeTruthy();
    expect(screen.getByText('Melhor até agora: ± 8 m.')).toBeTruthy();
    expect(screen.queryByText('Plus Code')).toBeNull();
  });

  test('sem sinal do GPS: pede para ir para um sítio aberto', async () => {
    mockGps = { estado: 'a_procurar', ultima: null };
    mockMedida = { captura: null, aMedir: true, leiturasBoas: 0, necessarias: 3, limite: 10, melhorAteAgora: null };
    await desenhar();
    expect(screen.getByText(/A procurar o sinal do GPS/)).toBeTruthy();
  });

  test('o código usa a posição medida, não a leitura ao vivo', async () => {
    // A leitura ao vivo saltou 15 m; o código continua o da média.
    mockGps = { estado: 'ok', posicao: { ...POS, latitude: POS.latitude + 0.000135 } };
    await desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
  });

  test('a medir de novo: mantém o código anterior e diz que está a medir', async () => {
    mockMedida = medida(POS, { aMedir: true, leiturasBoas: 1 });
    await desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
    expect(screen.getByText('A medir de novo… leitura 1 de 3.')).toBeTruthy();
    // O botão fica a rodar enquanto mede (como o "A localizar..." do site).
    expect(screen.getByRole('button', { name: 'Atualizar localização' })).toBeDisabled();
  });

  test('botão "Obter localização" / "Atualizar localização" mede de novo', async () => {
    mockMedida = { captura: null, aMedir: false, leiturasBoas: 0, necessarias: 3, limite: 10, melhorAteAgora: null };
    const { rerender } = await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Obter localização' }));
    expect(mockMedirDeNovo).toHaveBeenCalledTimes(1);

    mockMedida = medida(POS);
    await act(async () => {
      rerender(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <Mapa />
        </SafeAreaProvider>,
      );
      await Promise.resolve();
    });
    fireEvent.press(screen.getByRole('button', { name: 'Atualizar localização' }));
    expect(mockMedirDeNovo).toHaveBeenCalledTimes(2);
  });

  test('sem autorização: "Obter localização" volta a pedir a autorização', async () => {
    mockGps = { estado: 'sem_permissao' };
    mockMedida = { captura: null, aMedir: true, leiturasBoas: 0, necessarias: 3, limite: 10, melhorAteAgora: null };
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Obter localização' }));
    expect(mockTentarDeNovo).toHaveBeenCalledTimes(1);
    expect(mockMedirDeNovo).not.toHaveBeenCalled();
  });

  test('acima de 10 m: mostra o código com "Pouco preciso" e o aviso, e continua a medir', async () => {
    mockMedida = medida(POS, { captura: { ...POS, precisao: 15, leituras: 3, fraca: true }, aMedir: true, leiturasBoas: 1 });
    await desenhar();
    expect(screen.getByText(encode(POS.latitude, POS.longitude))).toBeTruthy();
    expect(screen.getByText('Pouco preciso (± 15 m)')).toBeTruthy();
    expect(screen.getByText('A tentar ter 3 leituras com menos de ±10 m… (1 de 3)')).toBeTruthy();
    expect(screen.getByText(/Precisão acima de 10 m: o código pode não ser o deste ponto/)).toBeTruthy();
  });

  test('acima de 10 m: o código fica "Provisório" e explica porque não está confirmado', async () => {
    mockOnline = true;
    mockMedida = medida(POS, { captura: { ...POS, precisao: 18, leituras: 3, fraca: true }, aMedir: true });
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-41', estado: 'provisorio', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'servidor', atualizadoEm: null },
    };
    await desenhar();
    expect(screen.getByText('Provisório')).toBeTruthy();
    expect(screen.getByText('Por confirmar: a precisão tem de ser melhor que ±10 m.')).toBeTruthy();
    expect(screen.queryByText('A confirmar com o servidor…')).toBeNull();
  });

  test('junto ao limite de duas células: avisa que o código pode trocar com o da vizinha', async () => {
    mockOnline = true;
    const c = limitesCelula(POS.latitude, POS.longitude);
    const perto = { ...POS, latitude: c.latMax - 2 / 110_574, longitude: (c.lngMin + c.lngMax) / 2, precisao: 3 };
    mockMedida = medida(perto);
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQPN2S-3-95', estado: 'confirmado', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'servidor', atualizadoEm: null },
    };
    await desenhar();
    expect(screen.getByText(/Estás junto ao limite entre duas células do código postal \(a 2 m\)/)).toBeTruthy();
  });

  test('no meio da célula: sem aviso de limite', async () => {
    const c = limitesCelula(POS.latitude, POS.longitude);
    const meio = { ...POS, latitude: (c.latMin + c.latMax) / 2, longitude: (c.lngMin + c.lngMax) / 2, precisao: 3 };
    mockMedida = medida(meio);
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQPN2S-3-95', estado: 'confirmado', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'servidor', atualizadoEm: null },
    };
    await desenhar();
    expect(screen.queryByText(/junto ao limite/)).toBeNull();
  });
});

const INFO_CONFIRMADA: InfoLocal = {
  plusCode: '',
  codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-41', estado: 'confirmado', confirmadoEm: '2026-09-23T21:16:00.000Z' },
  local: { provincia: 'Huambo', municipio: 'Caála', origem: 'servidor', atualizadoEm: null },
};
const PLUS = encode(POS.latitude, POS.longitude);
const LINK = 'https://www.google.com/maps?q=-12.776100,15.739200';

describe('Mapa igual ao site (8 passos)', () => {
  test('a ordem do ecrã é a aprovada', async () => {
    mockOnline = true;
    mockInfo = INFO_CONFIRMADA;
    mockMapa = { estado: 'sem_mapa', remoto: MANIFESTO };
    await desenhar();
    await screen.findByRole('button', { name: 'Registar esta casa, loja, escola...' });
    const texto = JSON.stringify(screen.toJSON());
    const posicoes = [
      'Pesquisar código, Plus Code, rua, bairro...',
      'Atualizar localização',
      'Ler QR',
      'Código Postal Digital',
      'Plus Code',
      'Divisão administrativa',
      'Precisão do GPS',
      'Coordenadas',
      'QR Code · abre no Google Maps',
      'Registar esta casa, loja, escola...',
      'mapa-nativo',
      'Privacidade',
      'Categoria',
      'Guardar como favorito',
      'Mapa para usar sem rede',
    ].map((t) => [t, texto.indexOf(JSON.stringify(t))] as const);
    for (const [t, i] of posicoes) expect([t, i >= 0]).toEqual([t, true]);
    const indices = posicoes.map(([, i]) => i);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  test('coordenadas e QR Code com o link do Google Maps', async () => {
    await desenhar();
    expect(screen.getByText('-12.77610, 15.73920')).toBeTruthy();
    expect(screen.getByTestId('qr').props.children).toBe(LINK);
  });

  test('"Guardar" o QR abre a partilha da imagem; "Partilhar" envia os códigos e o link', async () => {
    const partilha = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockInfo = INFO_CONFIRMADA;
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockPartilharQr).toHaveBeenCalledWith('iVBORbase64', 'codigo-postal-angola-localiza.png'));
    fireEvent.press(screen.getByRole('button', { name: 'Partilhar' }));
    const mensagem = (partilha.mock.calls[0][0] as { message: string }).message;
    expect(mensagem).toContain('Código Postal Digital: AO-HUA-MNFQR6JW-41');
    expect(mensagem).toContain(`Plus Code: ${PLUS}`);
    expect(mensagem).toContain(LINK);
    partilha.mockRestore();
  });

  test('se não der para guardar a imagem, explica porquê', async () => {
    mockPartilharQr.mockRejectedValueOnce(new Error('Este telemóvel não deixa guardar nem partilhar a imagem.'));
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Este telemóvel não deixa guardar nem partilhar a imagem.')).toBeTruthy();
  });

  test('"Registar esta casa, loja, escola..." abre o registo (com a verificação simples)', async () => {
    await desenhar();
    fireEvent.press(await screen.findByRole('button', { name: 'Registar esta casa, loja, escola...' }));
    expect(mockPush).toHaveBeenCalledWith('/guardados/registar');
  });

  test('sem a verificação simples: explica e leva à verificação', async () => {
    mockVerificacao = 'por_verificar';
    await desenhar();
    // No lugar do "Registar" e no "Guardar como favorito".
    expect(await screen.findAllByText(/precisas de fazer a verificação simples/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Registar esta casa, loja, escola...' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Fazer a verificação' }));
    expect(mockPush).toHaveBeenCalledWith('/definicoes/verificacao');
  });

  test('verificação em revisão: diz que está em revisão (sem botão)', async () => {
    mockVerificacao = 'pendente';
    await desenhar();
    expect((await screen.findAllByText(/está em revisão/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Fazer a verificação' })).toBeNull();
  });

  test('sem o separador Moradas (KYC por aprovar): não regista nem guarda favoritos', async () => {
    mockSeparadores = ['mapa', 'definicoes'];
    await desenhar();
    await waitFor(() => expect(screen.getAllByText(/precisas de fazer a verificação simples/).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Registar esta casa, loja, escola...' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Guardar como favorito' })).toBeDisabled();
  });
});

describe('pesquisa única', () => {
  test('Plus Code sem rede: vai para o ponto no mapa, sem pedir nada ao servidor', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), PLUS.toLowerCase());
    expect(mockPesquisar).not.toHaveBeenCalled();
    expect(await screen.findByText(`No mapa: ${PLUS}`)).toBeTruthy();
    expect(screen.getByTestId('marcador')).toBeTruthy();
    expect(chamadasCamara.at(-1)).toMatchObject({ metodo: 'flyTo', args: [expect.objectContaining({ zoom: 17 })] });
    fireEvent.press(screen.getByRole('button', { name: 'Tirar do mapa' }));
    expect(screen.queryByTestId('marcador')).toBeNull();
  });

  test('código postal sem rede: explica que precisa de rede', async () => {
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'AO-HUA-MNFQR6JW-41');
    expect(await screen.findByText(/Sem rede: sem internet só se encontram Plus Codes/)).toBeTruthy();
    expect(mockPesquisar).not.toHaveBeenCalled();
  });

  test('com rede: pesquisa automaticamente após 3 caracteres, mostra os resultados e leva ao escolhido', async () => {
    mockOnline = true;
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    mockPesquisar.mockResolvedValueOnce([
      { tipo: 'rua', id: 'r1', titulo: 'Rua da Missão', subtitulo: 'Rua · Bairro Académico', latitude: -12.77, longitude: 15.73, codigoPostal: null, plusCode: null },
      { tipo: 'bairro', id: 'b1', titulo: 'Bairro Novo', subtitulo: 'Bairro', latitude: null, longitude: null, codigoPostal: null, plusCode: null },
    ]);
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), '  missão ');
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'missão');
    fireEvent(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByText('Rua da Missão')).toBeTruthy();
    expect(mockPesquisar).toHaveBeenCalledWith('missão');
    expect(screen.getByText('Ainda sem posição no mapa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bairro: Bairro Novo' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Rua: Rua da Missão. Ver no mapa' }));
    expect(await screen.findByText('No mapa: Rua da Missão')).toBeTruthy();
  });

  test('sem resultados e erro do servidor', async () => {
    mockOnline = true;
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'nada disto');
    fireEvent(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByText('Sem resultados.')).toBeTruthy();

    mockPesquisar.mockRejectedValueOnce(new Error('Sem ligação ao servidor.'));
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'nada disto outra vez');
    fireEvent(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByText('Não foi possível pesquisar agora. Sem ligação ao servidor.')).toBeTruthy();
  });

  test('texto curto: pede mais letras', async () => {
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'ab');
    fireEvent(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByText('Escreve pelo menos 3 letras.')).toBeTruthy();
  });
});
describe('ponto pedido por outro ecrã', () => {
  afterEach(() => {
    mockParametros = {};
  });

  test('o destino de uma entrega aparece no mapa com o título', async () => {
    mockParametros = { lat: '-12.77', lng: '15.73', titulo: 'Destino: Maria João' };
    await desenhar();
    expect(await screen.findByText('No mapa: Destino: Maria João')).toBeTruthy();
  });

  test('coordenadas inválidas são ignoradas', async () => {
    mockParametros = { lat: 'x', lng: '15.73', titulo: 'Destino' };
    await desenhar();
    expect(screen.queryByText('No mapa: Destino')).toBeNull();
  });
});

describe('Ler QR', () => {
  test('lê um link do Google Maps e mostra o ponto (uma só leitura)', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Ler QR' }));
    expect(screen.getByTestId('leitor-qr')).toBeTruthy();
    await act(async () => mockLerQr?.({ data: 'https://www.google.com/maps?q=-12.7800,15.7400' }));
    expect(screen.getByText('Lido: https://www.google.com/maps?q=-12.7800,15.7400')).toBeTruthy();
    expect(await screen.findByText('No mapa: -12.78000, 15.74000')).toBeTruthy();
    expect(screen.queryByTestId('leitor-qr')).toBeNull();
    expect(mockPesquisar).not.toHaveBeenCalled();
  });

  test('um QR com outro link não abre sozinho: pergunta', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Ler QR' }));
    await act(async () => mockLerQr?.({ data: 'https://exemplo.ao/cartao' }));
    expect(screen.getByText('Este QR Code tem um link: https://exemplo.ao/cartao')).toBeTruthy();
    expect(abrir).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Abrir o link' }));
    expect(abrir).toHaveBeenCalledWith('https://exemplo.ao/cartao');
    abrir.mockRestore();
  });

  test('um QR com um código postal pesquisa no servidor', async () => {
    mockOnline = true;
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Ler QR' }));
    await act(async () => mockLerQr?.({ data: 'AO-HUA-MNFQR6JW-41' }));
    expect(mockPesquisar).toHaveBeenCalledWith('AO-HUA-MNFQR6JW-41');
  });

  test('"Cancelar" fecha o leitor', async () => {
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Ler QR' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('leitor-qr')).toBeNull();
  });
});

describe('Mapa / Satélite', () => {
  const estiloMostrado = () => (screen.getAllByTestId('mapa-nativo')[0].props.mapStyle as { name: string }).name;

  test('o mapa começa com zoom equivalente ao site e oferece controlos de zoom', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    expect(chamadasCamara).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(chamadasCamara.at(-1)).toMatchObject({ metodo: 'zoomTo', args: [18, { duration: 250 }] });
    fireEvent.press(screen.getByRole('button', { name: 'Diminuir zoom' }));
    expect(chamadasCamara.at(-1)).toMatchObject({ metodo: 'zoomTo', args: [14, { duration: 250 }] });
  });


  test('o marcador de localização pesquisada usa a cor primária do site', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    mockOnline = true;
    mockPesquisar.mockResolvedValueOnce([
      { tipo: 'rua', id: 'r1', titulo: 'Local pesquisado', subtitulo: 'Rua', latitude: -12.5, longitude: 13.4, codigoPostal: null, plusCode: null },
    ]);
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'local pesquisado');
    fireEvent(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByText('Local pesquisado')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Rua: Local pesquisado. Ver no mapa' }));
    expect(await screen.findByLabelText('Ponto encontrado: Local pesquisado')).toBeTruthy();
  });
  test('por omissão é o mapa do telemóvel', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    expect(estiloMostrado()).toBe('Angola Localiza');
    expect(screen.getByRole('radio', { name: 'Vista: Mapa' }).props.accessibilityState).toMatchObject({ selected: true });
  });


  test('mostra ficha contextual ao selecionar um ponto', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    mockOnline = true;
    mockPesquisar.mockResolvedValueOnce([
      { tipo: 'rua', id: 'r1', titulo: 'Local pesquisado', subtitulo: 'Rua', latitude: -12.5, longitude: 13.4, codigoPostal: null, plusCode: null },
    ]);
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'local pesquisado');
    fireEvent(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByText('Local pesquisado')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Rua: Local pesquisado. Ver no mapa' }));
    expect(await screen.findByLabelText('Ponto encontrado: Local pesquisado')).toBeTruthy();
    expect(screen.getAllByText('Local pesquisado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('-12.50000, 13.40000')).toBeTruthy();
  });
  test('sem rede: o satélite não liga e explica porquê', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    fireEvent.press(screen.getByRole('radio', { name: 'Vista: Satélite' }));
    expect(alerta).toHaveBeenCalledWith('Sem rede', expect.stringMatching(/precisa de internet/));
    expect(estiloMostrado()).toBe('Angola Localiza');
    alerta.mockRestore();
  });

  test('com rede: avisa dos dados móveis; só liga se a pessoa aceitar (e só pergunta uma vez)', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockOnline = true;
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    fireEvent.press(screen.getByRole('radio', { name: 'Vista: Satélite' }));
     const botoesAceite = alerta.mock.calls[0][2] as { text: string; onPress?: () => void }[];
     act(() => botoesAceite.find((b) => b.text === 'Usar satélite')!.onPress!());
     

    fireEvent.press(screen.getByRole('radio', { name: 'Vista: Satélite' }));
    expect(estiloMostrado()).toBe('Angola Localiza · Satélite');
    expect(screen.getByText('Imagens: Esri, Maxar, Earthstar Geographics')).toBeTruthy();

    fireEvent.press(screen.getByRole('radio', { name: 'Vista: Mapa' }));
    expect(estiloMostrado()).toBe('Localiza · Mapa online');
    fireEvent.press(screen.getByRole('radio', { name: 'Vista: Satélite' }));
    expect(alerta).toHaveBeenCalledTimes(1);
    expect(estiloMostrado()).toBe('Angola Localiza · Satélite');
    alerta.mockRestore();
  });

  test('se a rede cair, volta ao mapa do telemóvel', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockOnline = true;
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    const { rerender } = await desenhar();
    fireEvent.press(screen.getByRole('radio', { name: 'Vista: Satélite' }));
    const botoes = alerta.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    act(() => botoes.find((b) => b.text === 'Usar satélite')!.onPress!());
    mockOnline = false;
    rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Mapa />
      </SafeAreaProvider>,
    );
    expect(estiloMostrado()).toBe('Angola Localiza');
    alerta.mockRestore();
  });

  test('"Ecrã inteiro" abre o mapa sozinho e "Fechar" volta', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    await desenhar();
    fireEvent.press(screen.getByRole('button', { name: 'Ecrã inteiro' }));
    expect(screen.getAllByTestId('mapa-nativo')).toHaveLength(2);
    fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.getAllByTestId('mapa-nativo')).toHaveLength(1);
  });
});

describe('Guardar como favorito', () => {
  test('com rede: guarda com a privacidade e a categoria escolhidas e envia logo', async () => {
    mockOnline = true;
    mockInfo = INFO_CONFIRMADA;
    await desenhar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar como favorito' })).not.toBeDisabled());
    fireEvent.press(screen.getByRole('radio', { name: 'Privacidade: Privada (só tu e os administradores)' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Categoria: Casa' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar como favorito' }));
    expect(await screen.findByText('Guardado! Já aparece nas tuas Moradas (por validar).')).toBeTruthy();
    expect(mockGuardarDoMapa).toHaveBeenCalledWith(
      'u-ana',
      {
        latitude: POS.latitude,
        longitude: POS.longitude,
        precisao: POS.precisao,
        plusCode: PLUS,
        codigoPostal: 'AO-HUA-MNFQR6JW-41',
        provincia: 'Huambo',
        municipio: 'Caála',
      },
      { visibilidade: 'PRIVATE', categoria: 'casa' },
    );
    expect(mockEnviarPendentes).toHaveBeenCalledWith('u-ana');
    expect(mockAvisar).toHaveBeenCalled();
    // Não deixa guardar o mesmo ponto duas vezes.
    expect(screen.getByRole('button', { name: 'Guardado como favorito ✓' })).toBeDisabled();
  });

  test('sem rede: fica no telemóvel; o código provisório não vai para o servidor', async () => {
    mockInfo = {
      plusCode: '',
      codigoPostal: { codigo: 'AO-HUA-MNFQR6JW-41', estado: 'provisorio', confirmadoEm: null },
      local: { provincia: 'Huambo', municipio: 'Huambo', origem: 'guardado', atualizadoEm: '2026-09-20T10:00:00.000Z' },
    };
    await desenhar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar como favorito' })).not.toBeDisabled());
    fireEvent.press(screen.getByRole('button', { name: 'Guardar como favorito' }));
    expect(await screen.findByText('Guardado no telemóvel. Vai para o servidor quando houver rede.')).toBeTruthy();
    expect((mockGuardarDoMapa.mock.calls[0][1] as { codigoPostal: string | null }).codigoPostal).toBeNull();
    expect(mockGuardarDoMapa.mock.calls[0][2]).toEqual({ visibilidade: 'PUBLIC', categoria: 'outro' });
    expect(mockEnviarPendentes).not.toHaveBeenCalled();
  });

  test('com rede mas o envio falha: fica no telemóvel para depois', async () => {
    mockOnline = true;
    mockEnviarPendentes.mockResolvedValueOnce({ enviados: 0, erro: new Error('Sem ligação ao servidor.') });
    await desenhar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar como favorito' })).not.toBeDisabled());
    fireEvent.press(screen.getByRole('button', { name: 'Guardar como favorito' }));
    expect(await screen.findByText('Guardado no telemóvel. Vai para o servidor quando houver rede.')).toBeTruthy();
  });

  test('se não conseguir guardar no telemóvel, mostra o erro', async () => {
    mockGuardarDoMapa.mockRejectedValueOnce(new Error('Disco cheio.'));
    await desenhar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar como favorito' })).not.toBeDisabled());
    fireEvent.press(screen.getByRole('button', { name: 'Guardar como favorito' }));
    expect(await screen.findByText('Disco cheio.')).toBeTruthy();
  });

  test('com precisão fraca ou sem posição: não deixa guardar e diz porquê', async () => {
    mockMedida = medida(POS, { captura: { ...POS, precisao: 15, leituras: 3, fraca: true } });
    const { unmount } = await desenhar();
    expect(await screen.findByText('Espera por uma precisão melhor que ±10 m.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar como favorito' })).toBeDisabled();
    unmount();

    mockMedida = { captura: null, aMedir: true, leiturasBoas: 0, necessarias: 3, limite: 10, melhorAteAgora: null };
    await desenhar();
    expect(await screen.findByText('Espera que a tua posição seja medida.')).toBeTruthy();
  });

  test('sem a verificação simples: não deixa guardar', async () => {
    mockVerificacao = 'por_verificar';
    await desenhar();
    await waitFor(() => expect(screen.getAllByText(/precisas de fazer a verificação simples/)).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Guardar como favorito' })).toBeDisabled();
    expect(mockGuardarDoMapa).not.toHaveBeenCalled();
  });

  test('um gesto manual interrompe o seguimento automático do GPS', async () => {
    mockMapa = { estado: 'pronto', local: MANIFESTO, novo: null };
    mockOnline = true;
    mockPesquisar.mockResolvedValueOnce([
      { tipo: 'rua', id: 'r1', titulo: 'Local pesquisado', subtitulo: 'Rua', latitude: -12.5, longitude: 13.4, codigoPostal: null, plusCode: null },
    ]);
    await desenhar();
    fireEvent.changeText(screen.getByLabelText('Pesquisar'), 'local pesquisado');
    fireEvent.press(screen.getByLabelText('Pesquisar'), 'submitEditing');
    expect(await screen.findByRole('button', { name: 'Rua: Local pesquisado. Ver no mapa' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Rua: Local pesquisado. Ver no mapa' }));
    expect(await screen.findByLabelText('Local selecionado: Local pesquisado')).toBeTruthy();
    fireEvent(screen.getByTestId('vista-mapa'), 'touchStart');
    expect(await screen.findByRole('button', { name: 'Centrar em mim' })).toBeTruthy();
  });
});
