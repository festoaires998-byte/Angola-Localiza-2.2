import { useEffect, useRef, useState } from 'react';

import { codificarGrelha } from '@/domain/enderecamento/codigoPostal';
import { infoLocal } from '@/services/location/infoLocalApp';
import type { InfoLocal } from '@/services/location/infoLocal';

/**
 * Plus Code, Código Postal Digital e província/município da posição.
 * Sem rede: o que se calcula no telemóvel e o que está guardado.
 * Com rede (e sessão): pede ao servidor quando a pessoa muda de célula.
 */
export function useInfoLocal(
  posicao: { latitude: number; longitude: number } | null,
  online: boolean | null,
): InfoLocal | null {
  const [info, setInfo] = useState<InfoLocal | null>(null);
  const pedido = useRef(0);
  // Só volta a pedir quando muda a célula do código postal (~38 m × 19 m) ou a rede.
  const celula = posicao ? codificarGrelha(posicao.latitude, posicao.longitude) : null;
  const lat = posicao?.latitude ?? null;
  const lng = posicao?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lng === null) return;
    const meu = ++pedido.current;
    void (async () => {
      const semRede = await infoLocal.semRede(lat, lng).catch(() => null);
      if (meu === pedido.current && semRede) setInfo(semRede);
      if (!online) return;
      const comRede = await infoLocal.comRede(lat, lng).catch(() => null);
      if (meu === pedido.current && comRede) setInfo(comRede);
    })();
    // lat/lng ficam de fora de propósito: só a mudança de célula conta.
    // (O Plus Code, que muda a cada ~3 m, é calculado no ecrã.)
  }, [celula, online]);

  return info;
}
