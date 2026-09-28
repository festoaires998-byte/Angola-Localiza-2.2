// A tarefa de segundo plano tem de ser definida quando a app carrega (também
// quando o sistema a acorda sem abrir ecrãs): por isso é importada aqui.
import '@/sync/tarefaSegundoPlano';

import { useLinkingURL } from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CORES } from '@/components/tema';
import { tratarLink } from '@/services/links/tratarLinks';
import { sessao } from '@/state/sessao';
import { carregarPaisAtual, ouvirPais, paisAtual } from '@/state/pais';
import { nomeDaMarcaPorCodigo } from '@/config/pais';
import { iniciarSync } from '@/sync/gatilhos';
import { registarTarefaSync } from '@/sync/tarefaSegundoPlano';

/** Arranque global: sessão, país ativo e sincronização. */
export default function RootLayout() {
  const url = useLinkingURL();
  const [pais, setPais] = useState(paisAtual());

  useEffect(() => {
    sessao.iniciar();
    carregarPaisAtual().catch(() => undefined);
    iniciarSync();
    registarTarefaSync().catch(() => undefined);
  }, []);

  useEffect(() => { void tratarLink(url); }, [url]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: CORES.fundo } }} />
    </SafeAreaProvider>
  );
}