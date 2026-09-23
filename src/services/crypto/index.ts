import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { supabase } from '@/api/supabase';
import { obterConfigSupabase } from '@/config/env';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioChavesDispositivo } from '@/database/repositories/chavesDispositivo';
import { obterIdDispositivo } from '@/services/cofre/idDispositivo';
import { estaOnline } from '@/services/rede/conectividade';

import { garantirGetRandomValues } from './aleatorio';
import { criarAssinarProva } from './assinarProva';
import {
  criarChaveDispositivo,
  type ChaveDispositivo,
  type CorpoRegisto,
  type ResultadoRegisto,
  type SessaoRegisto,
} from './chaveDispositivo';

export { ALGORITMO_ASSINATURA, paraCamposProva, verificarAssinatura } from './assinarProva';
export type { DadosProva, ProvaAssinada } from './assinarProva';
export type { ResultadoRegisto } from './chaveDispositivo';
export type { JwkPublicaP256 } from './jwk';

/**
 * A chave privada só pode ser lida neste telemóvel (THIS_DEVICE_ONLY): não vai
 * para backups do iCloud/iTunes nem passa para outro iPhone. AFTER_FIRST_UNLOCK
 * deixa assinar e sincronizar com o ecrã bloqueado depois do primeiro desbloqueio.
 */
export const OPCOES_CHAVE_PRIVADA: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const TEMPO_MAXIMO_REGISTO = 20_000;

async function pedirRegisto(token: string, corpo: CorpoRegisto): Promise<'ok' | 'sessao' | string> {
  const { url, chaveAnon } = obterConfigSupabase();
  const controlo = new AbortController();
  const temporizador = setTimeout(() => controlo.abort(), TEMPO_MAXIMO_REGISTO);
  try {
    const resposta = await fetch(`${url}/functions/v1/signing-keys?action=register`, {
      method: 'POST',
      headers: {
        apikey: chaveAnon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: controlo.signal,
    });
    if (resposta.status === 401) return 'sessao';
    const corpoResposta = (await resposta.json().catch(() => null)) as
      | { ok?: unknown; error?: unknown }
      | null;
    if (resposta.ok && corpoResposta?.ok === true) return 'ok';
    const erro = typeof corpoResposta?.error === 'string' ? corpoResposta.error : '';
    return `signing-keys respondeu ${resposta.status}${erro ? `: ${erro}` : ''}`;
  } catch {
    return 'Sem ligação ao servidor.';
  } finally {
    clearTimeout(temporizador);
  }
}

let chave: Promise<ChaveDispositivo> | null = null;

function obterChaveApp(): Promise<ChaveDispositivo> {
  if (!chave) {
    chave = abrirBaseDados()
      .then((db) =>
        criarChaveDispositivo({
          cofre: {
            getItemAsync: (nome) => SecureStore.getItemAsync(nome, OPCOES_CHAVE_PRIVADA),
            setItemAsync: (nome, valor) =>
              SecureStore.setItemAsync(nome, valor, OPCOES_CHAVE_PRIVADA),
            deleteItemAsync: (nome) => SecureStore.deleteItemAsync(nome, OPCOES_CHAVE_PRIVADA),
          },
          chaves: criarRepositorioChavesDispositivo(db),
          obterIdDispositivo,
          prepararAleatorio: () => garantirGetRandomValues(getRandomValues),
          // Android: se o Keystore perdeu a chave (ex.: dados restaurados), a leitura
          // falha para sempre. iOS: a falha é quase sempre o telemóvel ainda bloqueado.
          erroDeLeituraEPerda: Platform.OS === 'android',
          async obterSessao() {
            const { data } = await supabase.auth.getSession();
            const s = data.session;
            return s?.user && s.access_token
              ? { userId: s.user.id, accessToken: s.access_token }
              : null;
          },
          estaOnline,
          pedirRegisto,
        }),
      )
      .catch((erro) => {
        chave = null;
        throw erro;
      });
  }
  return chave;
}

/**
 * Regista a chave pública deste aparelho no servidor, se ainda não estiver
 * registada para o utilizador da sessão. Precisa de rede e sessão.
 * Sem `sessao`, usa a sessão atual do supabase-js.
 */
export async function garantirChaveRegistada(sessao?: SessaoRegisto): Promise<ResultadoRegisto> {
  return (await obterChaveApp()).garantirChaveRegistada(sessao);
}

/**
 * Assina uma prova de entrega. Não precisa de rede.
 * Juntar ao `proof` da operação delivery_proof com paraCamposProva().
 */
export const assinarProva = criarAssinarProva({
  async assinar(mensagem) {
    return (await obterChaveApp()).assinar(mensagem);
  },
});
