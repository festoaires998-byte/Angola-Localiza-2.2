import { Stack } from 'expo-router';

import { CORES } from '@/components/tema';

export default function LayoutEnviar() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: CORES.primaria,
        headerTitleStyle: { color: CORES.texto, fontWeight: '700' },
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="novo" options={{ title: 'Novo envio' }} />
      <Stack.Screen name="[id]" options={{ title: 'Envio' }} />
    </Stack>
  );
}
