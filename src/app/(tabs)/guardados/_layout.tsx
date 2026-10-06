import { Stack } from 'expo-router';

import { CABECALHO, CORES } from '@/components/tema';

export default function LayoutMoradas() {
  return (
    <Stack
      screenOptions={{
        ...CABECALHO,
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="registar" options={{ title: 'Registar morada' }} />
      <Stack.Screen name="[id]" options={{ title: 'Morada' }} />
    </Stack>
  );
}
