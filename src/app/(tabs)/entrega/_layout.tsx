import { Stack } from 'expo-router';

import { cabecalho } from '@/components/tema';
import { useCores } from '@/components/temaApp';

export default function LayoutEnviar() {
  const CORES = useCores();
  return (
    <Stack
      screenOptions={{
        ...cabecalho(CORES),
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="novo" options={{ title: 'Novo envio' }} />
      <Stack.Screen name="[id]" options={{ title: 'Envio' }} />
    </Stack>
  );
}
