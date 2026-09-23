import { useCallback, useEffect, useState } from 'react';

import {
  CAPTURA_INICIAL,
  juntarLeitura,
  LEITURAS_NECESSARIAS,
  LIMITE_PRECISAO_M,
  leiturasBoas,
  medirDeNovo,
  melhorPrecisao,
  type Captura,
  type Leitura,
} from '@/domain/enderecamento/capturaGps';

export interface CapturaGps {
  /** Posição medida (média de várias leituras); null antes da primeira medição. */
  captura: Captura | null;
  /** true enquanto junta leituras (a captura anterior, se houver, continua válida). */
  aMedir: boolean;
  /** Leituras boas já juntas na medição em curso (para "leitura 2 de 3"). */
  leiturasBoas: number;
  necessarias: number;
  /** Precisão pedida (m): só as leituras abaixo disto contam. */
  limite: number;
  /** Melhor precisão da medição em curso (m), para "melhor até agora ±15 m". */
  melhorAteAgora: number | null;
  medirDeNovo(): void;
}

/**
 * Recebe as leituras ao vivo do GPS (`usePosicao`) e devolve uma posição
 * medida com várias leituras (ver `src/domain/enderecamento/capturaGps.ts`).
 * Serve para o código do Mapa e para guardar uma morada.
 */
export function useCapturaGps(leitura: Leitura | null): CapturaGps {
  const [estado, setEstado] = useState(CAPTURA_INICIAL);

  useEffect(() => {
    if (leitura) setEstado((e) => juntarLeitura(e, leitura));
    // Cada leitura nova do GPS tem uma hora nova.
  }, [leitura?.hora, leitura?.latitude, leitura?.longitude]);

  const denovo = useCallback(() => setEstado(medirDeNovo), []);
  return {
    captura: estado.captura,
    aMedir: estado.aMedir,
    leiturasBoas: leiturasBoas(estado.leituras),
    necessarias: LEITURAS_NECESSARIAS,
    limite: LIMITE_PRECISAO_M,
    melhorAteAgora: melhorPrecisao(estado.leituras),
    medirDeNovo: denovo,
  };
}
