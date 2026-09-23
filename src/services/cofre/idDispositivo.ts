import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { CofreChaves } from './armazenamentoSessao';

/** Nome, no expo-secure-store, do identificador deste aparelho. */
export const NOME_ID_DISPOSITIVO = 'angola_localiza.id_dispositivo';

const FORMATO = /^app-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cria a função que devolve o identificador do aparelho ("app-" + UUID).
 * É criado na primeira vez e guardado no expo-secure-store; depois é sempre o mesmo.
 */
export function criarObterIdDispositivo(cofre: CofreChaves, gerarUuid: () => string) {
  let pedido: Promise<string> | null = null;
  return function obterIdDispositivo(): Promise<string> {
    if (!pedido) {
      pedido = (async () => {
        const guardado = await cofre.getItemAsync(NOME_ID_DISPOSITIVO);
        if (guardado && FORMATO.test(guardado)) return guardado;
        const novo = `app-${gerarUuid()}`;
        if (!FORMATO.test(novo)) throw new Error('Não foi possível gerar o identificador do aparelho.');
        await cofre.setItemAsync(NOME_ID_DISPOSITIVO, novo);
        return novo;
      })().catch((erro) => {
        pedido = null;
        throw erro;
      });
    }
    return pedido;
  };
}

/** Identificador deste aparelho, ex.: "app-3b0c...". */
export const obterIdDispositivo = criarObterIdDispositivo(SecureStore, randomUUID);
