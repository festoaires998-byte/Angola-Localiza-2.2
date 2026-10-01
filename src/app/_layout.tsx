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
import { instalarRelatorioErros, relatorioErros } from '@/services/erros/relatorioApp';
import { Botao, Ecra, Texto, Titulo } from '@/components/ui';

/**
 * Se um ecrã falhar ao desenhar: explica em palavras simples, guarda o erro
 * para o relatório e deixa tentar outra vez (em vez de um ecrã em branco).
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    void relatorioErros.registar(error, { ecra: 'ErrorBoundary' });
  }, [error]);
  // O expo-router já põe tudo dentro de um SafeAreaProvider.
  return (
    <Ecra>
      <Titulo>Algo correu mal</Titulo>
      <Texto>Este ecrã teve um problema. O erro foi guardado para ser corrigido. Os teus dados continuam no telemóvel.</Texto>
      <Botao titulo="Tentar outra vez" onPress={() => void retry()} />
    </Ecra>
  );
}

/** Arranque global: sessão, país ativo, sincronização e relatório de erros. */
export default function RootLayout() {
  const url = useLinkingURL();
  const [pais, setPais] = useState(paisAtual());

  useEffect(() => {
    instalarRelatorioErros();
    sessao.iniciar();
    carregarPaisAtual().catch(() => undefined);
    iniciarSync();
    registarTarefaSync().catch(() => undefined);
  }, []);

  useEffect(() => { void tratarLink(url); }, [url]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: CORES.fundo } }}>
        <Stack.Screen name="chat-organizacao" options={{ title: 'Falar com a organização' }} />
      </Stack>
    </SafeAreaProvider>
  );
}