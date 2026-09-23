import { getRandomValues } from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/api/supabase';
import { obterConfigSupabase } from '@/config/env';
import { cofreApp } from '@/services/cofre/cofreApp';
import { obterIdDispositivo } from '@/services/cofre/idDispositivo';
import { estaOnline } from '@/services/rede/conectividade';
import { obterRepositoriosSync } from '@/sync/fila';

import { garantirGetRandomValues } from './aleatorio';
import { criarAssinarProva, provaAssinadaCom } from './assinarProva';
import {
  criarChaveDispositivo,
  type ChaveDispositivo,
  type CorpoRegisto,
  type EstadoChaves,
  type ResultadoRegisto,
  type SessaoRegisto,
} from './chaveDispositivo';

export { ALGORITMO_ASSINATURA, paraCamposProva, verificarAssinatura } from './assinarProva';
export type { DadosProva, ProvaAssinada } from './assinarProva';
export type { EstadoChaves, ResultadoRegisto } from './chaveDispositivo';
export type { JwkPublicaP256 } from './jwk';

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
    chave = obterRepositoriosSync()
      .then(({ fila, chaves }) =>
        criarChaveDispositivo({
          // cofreApp: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY (não vai para backups nem
          // para outro telemóvel) e fora do backup automático do Android.
          cofre: cofreApp,
          chaves,
          obterIdDispositivo,
          prepararAleatorio: () => garantirGetRandomValues(getRandomValues),
          // Android: se o Keystore perdeu a chave, a leitura falha para sempre.
          // iOS: a falha é quase sempre o telemóvel ainda não desbloqueado depois de ligar.
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
          async haProvasPorEnviarAssinadasCom(userId, deviceId, jwk) {
            const provas = await fila.listarPorEnviarDoTipo(userId, 'delivery_proof');
            return provas.some((op) => provaAssinadaCom(op.payload, deviceId, jwk));
          },
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
 * Se a chave local mudou e ainda há provas por enviar assinadas com a chave
 * antiga, espera (devolve "espera") até essas provas serem enviadas.
 * Sem `sessao`, usa a sessão atual do supabase-js.
 */
export async function garantirChaveRegistada(sessao?: SessaoRegisto): Promise<ResultadoRegisto> {
  return (await obterChaveApp()).garantirChaveRegistada(sessao);
}

/** Chave local e chave registada no servidor para o utilizador (sem rede). */
export async function estadoChaves(userId: string): Promise<EstadoChaves> {
  return (await obterChaveApp()).estado(userId);
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
