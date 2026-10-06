import { Stack } from 'expo-router';

import { CABECALHO, CORES } from '@/components/tema';

/** Admin: a lista das verificações por rever e, por cima, o detalhe de cada uma (Voltar regressa à lista). */
export default function LayoutAdmin() {
  return (
    <Stack
      screenOptions={{
        ...CABECALHO,
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
