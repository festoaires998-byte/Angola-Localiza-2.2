import { Stack } from 'expo-router';

import { CABECALHO, CORES } from '@/components/tema';

export default function LayoutDefinicoes() {
  return (
    <Stack
      screenOptions={{
        ...CABECALHO,
        contentStyle: { backgroundColor: CORES.fundoEcra },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
      <Stack.Screen name="verificacao" options={{ title: 'Verificação simples' }} />
      <Stack.Screen name="identidade" options={{ title: 'Verificação de identidade' }} />
      <Stack.Screen name="motorista" options={{ title: 'Motorista' }} />
      <Stack.Screen name="apagar-conta" options={{ title: 'Apagar a conta' }} />
    </Stack>
  );
}
