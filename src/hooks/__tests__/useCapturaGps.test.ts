import { describe, expect, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import type { Leitura } from '@/domain/enderecamento/capturaGps';
import { useCapturaGps } from '../useCapturaGps';

const l = (hora: number, precisao = 6): Leitura => ({ latitude: -12.7761, longitude: 15.7392, precisao, hora });

describe('useCapturaGps', () => {
  test('junta as leituras que chegam e fixa a captura à 3.ª boa', () => {
    const { result, rerender } = renderHook(({ leitura }: { leitura: Leitura | null }) => useCapturaGps(leitura), {
      initialProps: { leitura: null as Leitura | null },
    });
    expect(result.current).toMatchObject({ captura: null, aMedir: true, leiturasBoas: 0, necessarias: 3 });
    rerender({ leitura: l(1000) });
    rerender({ leitura: l(2000) });
    expect(result.current.leiturasBoas).toBe(2);
    rerender({ leitura: l(3000) });
    expect(result.current.captura).toMatchObject({ leituras: 3, fraca: false });
    expect(result.current.aMedir).toBe(false);

    act(() => result.current.medirDeNovo());
    expect(result.current.aMedir).toBe(true);
    expect(result.current.captura).not.toBeNull();
  });
});
