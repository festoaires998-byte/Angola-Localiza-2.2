import { Stack } from 'expo-router';

import { CABECALHO, CORES } from '@/components/tema';

export default function LayoutEnviar() {
  return (
    <Stack
      screenOptions={{
        ...CABECALHO,
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="novo" options={{ title: 'Novo envio' }} />
      <Stack.Screen name="[id]" options={{ title: 'Envio' }} />
    </Stack>
  );
}
