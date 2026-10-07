import { Stack } from 'expo-router';

import { cabecalho } from '@/components/tema';
import { useCores } from '@/components/temaApp';

export default function LayoutMoradas() {
  const CORES = useCores();
  return (
    <Stack
      screenOptions={{
        ...cabecalho(CORES),
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="registar" options={{ title: 'Registar morada' }} />
      <Stack.Screen name="[id]" options={{ title: 'Morada' }} />
    </Stack>
  );
}
