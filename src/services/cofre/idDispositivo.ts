import { randomUUID } from 'expo-crypto';

import type { CofreChaves } from './armazenamentoSessao';
import { cofreApp } from './cofreApp';
import { NOME_ID_DISPOSITIVO } from './nomes';

export { NOME_ID_DISPOSITIVO } from './nomes';

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
export const obterIdDispositivo = criarObterIdDispositivo(cofreApp, randomUUID);
