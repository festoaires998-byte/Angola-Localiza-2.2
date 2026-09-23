/**
 * Verificações do ecrã provisório de diagnóstico (primeiro build no telemóvel).
 *
 * Cada módulo é importado só dentro da sua verificação: se uma peça nativa
 * falhar ao carregar, só essa verificação fica com ❌ e as outras correm na mesma.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface Verificacao {
  id: string;
  titulo: string;
  /** Devolve o texto a mostrar quando corre bem; lança um erro quando falha. */
  correr(): Promise<string>;
}

const TEMPO_MAXIMO_SUPABASE = 15_000;

export const VERIFICACOES: readonly Verificacao[] = [
  {
    id: 'base-dados',
    titulo: 'Base de dados',
    async correr() {
      const { abrirBaseDados } = await import('@/database/client');
      const { lerVersao, MIGRACOES } = await import('@/database/migrations');
      const versao = await lerVersao(await abrirBaseDados());
      if (versao !== MIGRACOES.length) {
        throw new Error(`Versão ${versao}, esperada ${MIGRACOES.length}.`);
      }
      return `Aberta e migrada. Versão ${versao}.`;
    },
  },
  {
    id: 'cofre',
    titulo: 'Cofre',
    async correr() {
      const { obterIdDispositivo } = await import('@/services/cofre/idDispositivo');
      return `device_id: ${await obterIdDispositivo()}`;
    },
  },
  {
    id: 'assinatura',
    titulo: 'Assinatura',
    async correr() {
      const crypto = await import('@/services/crypto');
      const { encode } = await import('@/domain/enderecamento/plusCode');
      const { deviceId, jwk } = await crypto.chavePublicaDoAparelho();
      const prova = await crypto.assinarProva({
        delivery_id: 'diagnostico',
        lat: -8.8383,
        lng: 13.2344,
        plus_code: encode(-8.8383, 13.2344),
        foto_sha256: null,
        assinatura_manuscrita_sha256: null,
      });
      if (prova.device_id !== deviceId) {
        throw new Error(`Assinada pelo aparelho ${prova.device_id}, esperado ${deviceId}.`);
      }
      if (!crypto.verificarAssinatura(prova.payload_assinado, prova.assinatura, jwk)) {
        throw new Error('A assinatura não confere com a chave pública.');
      }
      return `Mensagem de teste assinada e verificada (${prova.algoritmo}).`;
    },
  },
  {
    id: 'gps',
    titulo: 'GPS',
    async correr() {
      const Location = await import('expo-location');
      const { encode } = await import('@/domain/enderecamento/plusCode');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error(`Permissão de localização: ${status}.`);
      const posicao = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude, accuracy } = posicao.coords;
      const precisao = accuracy == null ? 'desconhecida' : `${Math.round(accuracy)} m`;
      return (
        `${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n` +
        `Precisão: ${precisao}\n` +
        `Plus Code: ${encode(latitude, longitude, 11)}`
      );
    },
  },
  {
    id: 'supabase',
    titulo: 'Supabase',
    async correr() {
      const { obterConfigSupabase } = await import('@/config/env');
      const { url, chaveAnon } = obterConfigSupabase();
      const controlo = new AbortController();
      const temporizador = setTimeout(() => controlo.abort(), TEMPO_MAXIMO_SUPABASE);
      const inicio = Date.now();
      try {
        // Endpoint público do serviço de autenticação: não precisa de login.
        const resposta = await fetch(`${url}/auth/v1/health`, {
          headers: { apikey: chaveAnon },
          signal: controlo.signal,
        });
        if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status}.`);
        return `${url} respondeu em ${Date.now() - inicio} ms.`;
      } catch (erro) {
        if (controlo.signal.aborted) throw new Error('Sem resposta em 15 segundos.');
        throw erro;
      } finally {
        clearTimeout(temporizador);
      }
    },
  },
  {
    id: 'versoes',
    titulo: 'Versões',
    async correr() {
      const config = Constants.expoConfig;
      return (
        `App: ${config?.version ?? '?'}\n` +
        `Expo SDK: ${config?.sdkVersion ?? '?'}\n` +
        `${Platform.OS} ${Platform.Version}`
      );
    },
  },
];

export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
