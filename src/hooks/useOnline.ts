import { useEffect, useState } from 'react';

import { estaOnline, subscrever } from '@/services/rede/conectividade';

/** Há rede agora? (null enquanto não se sabe) */
export function useOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let ativo = true;
    estaOnline().then((o) => ativo && setOnline(o)).catch(() => undefined);
    const parar = subscrever((o) => ativo && setOnline(o));
    return () => {
      ativo = false;
      parar();
    };
  }, []);
  return online;
}
