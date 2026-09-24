import { Stack } from 'expo-router';

import { CORES } from '@/components/tema';

export default function LayoutEntregas() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: CORES.primaria,
        headerTitleStyle: { color: CORES.texto, fontWeight: '700' },
        contentStyle: { backgroundColor: CORES.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Entrega' }} />
      <Stack.Screen name="prova" options={{ title: 'Prova de entrega' }} />
      <Stack.Screen name="falha" options={{ title: 'Não foi possível entregar' }} />
    </Stack>
  );
}
