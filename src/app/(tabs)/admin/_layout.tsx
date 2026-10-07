import { Stack } from 'expo-router';

import { cabecalho } from '@/components/tema';
import { useCores } from '@/components/temaApp';

/** Admin: a lista das verificações por rever e, por cima, o detalhe de cada uma (Voltar regressa à lista). */
export default function LayoutAdmin() {
  const CORES = useCores();
  return (
    <Stack
      screenOptions={{
        ...cabecalho(CORES),
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
