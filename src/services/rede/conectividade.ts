import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Há rede? Conta como "online" quando há ligação e a internet não foi dada
 * como inalcançável (isInternetReachable pode ser null enquanto o sistema
 * ainda está a verificar: nesse caso tenta-se, o envio falha sozinho se não der).
 */
export function temRede(estado: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return estado.isConnected === true && estado.isInternetReachable !== false;
}

/** Pergunta agora ao sistema se há rede. */
export async function estaOnline(): Promise<boolean> {
  try {
    return temRede(await NetInfo.fetch());
  } catch {
    return false;
  }
}

/**
 * Chama `mudanca(online)` sempre que a ligação muda (só quando passa de
 * online para offline ou ao contrário). Devolve "deixar de ouvir".
 */
export function subscrever(mudanca: (online: boolean) => void): () => void {
  let anterior: boolean | null = null;
  return NetInfo.addEventListener((estado) => {
    const agora = temRede(estado);
    if (agora === anterior) return;
    anterior = agora;
    mudanca(agora);
  });
}
