import { encode } from '@/domain/enderecamento/plusCode';
import type { LocalProva } from '@/domain/entregas/estafeta';

import { useCapturaGps } from './useCapturaGps';
import { usePosicao } from './usePosicao';

export interface EstadoLocalProva {
  /** Posição medida (mesmo que fraca: a entrega acontece onde acontece), ou null enquanto mede. */
  local: LocalProva | null;
  /** Precisão em metros, se houver medida. */
  precisao: number | null;
  fraca: boolean;
  /** Frase simples do estado do GPS. */
  texto: string;
}

/** Posição para as provas de entrega (funciona sem rede). */
export function useLocalProva(): EstadoLocalProva {
  const gps = usePosicao();
  const medida = useCapturaGps(gps.estado === 'ok' ? gps.posicao : null);
  const c = medida.captura;
  if (c) {
    return {
      local: { latitude: c.latitude, longitude: c.longitude, plusCode: encode(c.latitude, c.longitude) },
      precisao: c.precisao,
      fraca: c.fraca,
      texto: c.fraca ? `Posição fraca (± ${Math.round(c.precisao)} m). Se puderes, vai para um sítio aberto.` : `Posição medida (± ${Math.round(c.precisao)} m).`,
    };
  }
  const texto =
    gps.estado === 'sem_permissao'
      ? 'Sem permissão para usar o GPS. Dá a permissão nas definições do telemóvel.'
      : gps.estado === 'gps_desligado'
        ? 'O GPS está desligado. Liga a localização do telemóvel.'
        : 'A medir a posição…';
  return { local: null, precisao: null, fraca: false, texto };
}
