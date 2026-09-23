// Polyfill de URL pedido pela documentação do Supabase para Expo/React Native.
// Tem de vir antes do supabase-js.
import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { obterConfigSupabase } from '@/config/env';
import { armazenamentoSessao } from '@/services/cofre/armazenamentoSessao';

const { url, chaveAnon } = obterConfigSupabase();

/** Cliente único do Supabase para toda a app. */
export const supabase = createClient(url, chaveAnon, {
  auth: {
    storage: armazenamentoSessao,
    autoRefreshToken: true,
    persistSession: true,
    // Na app não há URL de browser para ler a sessão.
    detectSessionInUrl: false,
    // Recomendado pela documentação para React Native (não há navigator.locks).
    lock: processLock,
  },
});

/**
 * Só renova os tokens enquanto a app está em primeiro plano. Em segundo plano
 * pára (poupa bateria e evita pedidos que o sistema corta a meio).
 */
if (Platform.OS !== 'web') {
  const aplicar = (estado: string) => {
    if (estado === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  AppState.addEventListener('change', aplicar);
  if (AppState.currentState) aplicar(AppState.currentState);
}
