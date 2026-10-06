import { Stack } from 'expo-router';

import { CORES } from '@/components/tema';

/** Admin: a lista das verificações por rever e, por cima, o detalhe de cada uma (Voltar regressa à lista). */
export default function LayoutAdmin() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: CORES.primaria,
        headerTitleStyle: { color: CORES.texto, fontWeight: '700' },
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Verificação' }} />
      <Stack.Screen name="motoristas" options={{ title: 'Motoristas' }} />
      <Stack.Screen name="identidade" options={{ title: 'Identidade do pessoal' }} />
    </Stack>
  );
}
