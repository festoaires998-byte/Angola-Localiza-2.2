import { Stack } from 'expo-router';

import { cabecalho } from '@/components/tema';
import { useCores } from '@/components/temaApp';

export default function LayoutDefinicoes() {
  const CORES = useCores();
  return (
    <Stack
      screenOptions={{
        ...cabecalho(CORES),
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
      <Stack.Screen name="verificacao" options={{ title: 'Verificação simples' }} />
      <Stack.Screen name="identidade" options={{ title: 'Verificação de identidade' }} />
      <Stack.Screen name="motorista" options={{ title: 'Motorista' }} />
      <Stack.Screen name="apagar-conta" options={{ title: 'Apagar a conta' }} />
    </Stack>
  );
}
