// A tarefa de segundo plano tem de ser definida quando a app carrega (também
// quando o sistema a acorda sem abrir ecrãs): por isso é importada aqui.
import '@/sync/tarefaSegundoPlano';

import { useLinkingURL } from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import * as SystemUI from 'expo-system-ui';

import { ProvedorTema, useTema } from '@/components/temaApp';
import { carregarPreferenciaTema } from '@/state/tema';
import { tratarLink } from '@/services/links/tratarLinks';
import { sessao } from '@/state/sessao';
import { carregarPaisAtual } from '@/state/pais';
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

/** Arranque global: tema, letra, sessão, país ativo, sincronização e relatório de erros. */
export default function RootLayout() {
  return (
    <ProvedorTema>
      <Raiz />
    </ProvedorTema>
  );
}

function Raiz() {
  const { esquema, cores } = useTema();
  const url = useLinkingURL();
  // A letra vem dentro da app (sem rede). Enquanto carrega, usa a do sistema.
  useFonts(LETRAS);

  useEffect(() => {
    instalarRelatorioErros();
    carregarPreferenciaTema().catch(() => undefined);
    sessao.iniciar();
    carregarPaisAtual().catch(() => undefined);
    iniciarSync();
    registarTarefaSync().catch(() => undefined);
  }, []);

  useEffect(() => { void tratarLink(url); }, [url]);

  // Fundo por trás de tudo (aparece ao rodar o ecrã e ao abrir teclados).
  useEffect(() => { SystemUI.setBackgroundColorAsync(cores.fundoEcra).catch(() => undefined); }, [cores.fundoEcra]);

  return (
    <SafeAreaProvider>
      <StatusBar style={esquema === 'escuro' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundoEcra } }}>
        <Stack.Screen name="chat-organizacao" options={{ title: 'Falar com a organização' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const LETRAS = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};
