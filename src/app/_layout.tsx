// A tarefa de segundo plano tem de ser definida quando a app carrega (também
// quando o sistema a acorda sem abrir ecrãs): por isso é importada aqui.
import '@/sync/tarefaSegundoPlano';

import { useLinkingURL } from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CORES } from '@/components/tema';
import { inicializarConfigPais } from '@/config/pais';
import { tratarLink } from '@/services/links/tratarLinks';
import { sessao } from '@/state/sessao';
import { iniciarSync } from '@/sync/gatilhos';
import { registarTarefaSync } from '@/sync/tarefaSegundoPlano';

/**
 * Arranque da app: lê a sessão guardada (funciona sem rede), liga a
 * sincronização automática e pede ao sistema a sincronização em segundo plano.
 * Os ecrãs mostram "A abrir…" enquanto a sessão é lida (ver src/app/index.tsx).
 */
export default function RootLayout() {
  const url = useLinkingURL();

  useEffect(() => {
    sessao.iniciar();
    inicializarConfigPais().catch(() => undefined);
    iniciarSync();
    registarTarefaSync().catch(() => undefined);
  }, []);

  useEffect(() => {
    void tratarLink(url);
  }, [url]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: CORES.fundo } }} />
    </SafeAreaProvider>
  );
}
