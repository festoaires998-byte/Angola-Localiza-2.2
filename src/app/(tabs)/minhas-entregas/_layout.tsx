import { Stack } from 'expo-router';

import { CABECALHO, CORES } from '@/components/tema';

export default function LayoutEntregas() {
  return (
    <Stack
      screenOptions={{
        ...CABECALHO,
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
