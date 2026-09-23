import { Stack } from 'expo-router';

import { CORES } from '@/components/tema';

export default function LayoutMoradas() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: CORES.primaria,
        headerTitleStyle: { color: CORES.texto, fontWeight: '700' },
        contentStyle: { backgroundColor: CORES.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Morada' }} />
    </Stack>
  );
}
