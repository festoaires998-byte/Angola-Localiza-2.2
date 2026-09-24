import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

let mockPermissao: { granted: boolean } | null = { granted: true };
let mockResposta = { granted: true };
const mockPedir = jest.fn(async () => mockResposta);
let mockLer: ((r: { data: string }) => void) | undefined;
jest.mock('expo-camera', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    useCameraPermissions: () => [mockPermissao, mockPedir],
    CameraView: (props: { onBarcodeScanned?: (r: { data: string }) => void; barcodeScannerSettings?: unknown }) => {
      mockLer = props.onBarcodeScanned;
      return <View testID="camara" {...({ definicoes: props.barcodeScannerSettings } as object)} />;
    },
  };
});

const { LeitorQr } = require('./LeitorQr') as typeof import('./LeitorQr');

beforeEach(() => {
  mockPermissao = { granted: true };
  mockResposta = { granted: true };
  mockPedir.mockClear();
  mockLer = undefined;
});

describe('LeitorQr', () => {
  test('lê só QR Codes e entrega o conteúdo uma só vez', () => {
    const aoLer = jest.fn();
    render(<LeitorQr aoLer={aoLer} aoFechar={jest.fn()} />);
    expect(screen.getByTestId('camara').props.definicoes).toEqual({ barcodeTypes: ['qr'] });
    mockLer?.({ data: 'AO-HUA-MNFQR6JW-41' });
    mockLer?.({ data: 'AO-HUA-MNFQR6JW-41' });
    mockLer?.({ data: '' });
    expect(aoLer).toHaveBeenCalledTimes(1);
    expect(aoLer).toHaveBeenCalledWith('AO-HUA-MNFQR6JW-41');
  });

  test('sem autorização: pede; se recusar, explica e deixa fechar', async () => {
    mockPermissao = { granted: false };
    mockResposta = { granted: false };
    const aoFechar = jest.fn();
    render(<LeitorQr aoLer={jest.fn()} aoFechar={aoFechar} />);
    expect(await screen.findByText('Sem autorização para usar a câmara. Autoriza nas definições do telemóvel.')).toBeTruthy();
    expect(mockPedir).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('camara')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    expect(aoFechar).toHaveBeenCalled();
  });

  test('sem autorização mas a pessoa aceita: não mostra erro', async () => {
    mockPermissao = { granted: false };
    render(<LeitorQr aoLer={jest.fn()} aoFechar={jest.fn()} />);
    await waitFor(() => expect(mockPedir).toHaveBeenCalled());
    expect(screen.queryByText(/Sem autorização/)).toBeNull();
  });
});
