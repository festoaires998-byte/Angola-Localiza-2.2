import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';

import { supabase } from '@/api/supabase';
import { obterConfigSupabase } from '@/config/env';
import { estadoChaves, garantirChaveRegistada } from '@/services/crypto';
import { estaOnline } from '@/services/rede/conectividade';
import { criarLoja } from '@/state/loja';

import { eventosSync } from './eventos';
import { obterRepositoriosSync } from './fila';
import {
  criarMotorSync,
  ErroSessaoInvalida,
  estadoSyncInicial,
  type EstadoSync,
  type MotorSync,
  type ResumoSync,
  type SessaoSync,
} from './nucleoMotor';

export { AVISO_ASSINATURA_NAO_CONFERE, ERRO_FOTO_ALTERADA, ErroSessaoInvalida, MENSAGENS } from './nucleoMotor';
export type { EstadoSync, MotivoFim, ResumoSync } from './nucleoMotor';

/** Estado do motor, sempre disponível (mesmo antes de a base de dados abrir). */
export const estadoSync = criarLoja<EstadoSync>(estadoSyncInicial());

function paraSessaoSync(s: Session | null): SessaoSync | null {
  if (!s?.user || !s.access_token) return null;
  return {
    userId: s.user.id,
    accessToken: s.access_token,
    expiraEm: typeof s.expires_at === 'number' ? s.expires_at * 1000 : null,
  };
}

/**
 * caminho_local pode ser um URI completo ("file://..."), um caminho absoluto
 * ou um nome relativo a documentDirectory.
 */
function ficheiroLocal(caminho: string): File {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(caminho)) return new File(caminho);
  if (caminho.startsWith('/')) return new File(`file://${caminho}`);
  return new File(Paths.document, caminho);
}

let motor: Promise<MotorSync> | null = null;

function obterMotor(): Promise<MotorSync> {
  if (!motor) {
    motor = obterRepositoriosSync()
      .then(({ fila, ficheiros, evidencias }) =>
        criarMotorSync({
          fila,
          ficheiros,
          async obterSessao() {
            const { data } = await supabase.auth.getSession();
            return paraSessaoSync(data.session);
          },
          async renovarSessao() {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) {
              // Sem rede: tenta-se mais tarde. Outro erro: o servidor recusou a sessão.
              if (isAuthRetryableFetchError(error)) throw error;
              throw new ErroSessaoInvalida(error.message);
            }
            return paraSessaoSync(data.session);
          },
          estaOnline,
          chaveAssinatura: {
            estado: estadoChaves,
            garantirRegistada: (sessao) => garantirChaveRegistada(sessao),
          },
          evidencias,
          async lerFicheiro(caminho) {
            const f = ficheiroLocal(caminho);
            return f.exists ? await f.bytes() : null;
          },
          async apagarFicheiro(caminho) {
            const f = ficheiroLocal(caminho);
            if (f.exists) f.delete();
          },
          fetch: (...args) => fetch(...args),
          config: obterConfigSupabase(),
          eventos: eventosSync,
          estado: estadoSync,
        }),
      )
      .catch((erro) => {
        motor = null;
        throw erro;
      });
  }
  return motor;
}

/**
 * Envia a fila de saída do utilizador com sessão.
 * forcar = true ignora a espera entre tentativas (botão "Sincronizar agora").
 */
export async function sincronizar(opcoes: { forcar?: boolean } = {}): Promise<ResumoSync> {
  return (await obterMotor()).sincronizar(opcoes);
}
