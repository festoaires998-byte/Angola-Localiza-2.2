import { Stack } from 'expo-router';

import { cabecalho } from '@/components/tema';
import { useCores } from '@/components/temaApp';

export default function LayoutEntregas() {
  const CORES = useCores();
  return (
    <Stack
      screenOptions={{
        ...cabecalho(CORES),
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Entrega' }} />
      <Stack.Screen name="prova" options={{ title: 'Prova de entrega' }} />
      <Stack.Screen name="falha" options={{ title: 'Não foi possível entregar' }} />
    </Stack>
  );
}
