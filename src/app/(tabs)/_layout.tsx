import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icone } from '@/components/Icone';
import { NOMES_SEPARADORES } from '@/components/nomes';
import { CORES } from '@/components/tema';
import { EcraCarregamento } from '@/components/ui';
import { SEPARADORES } from '@/domain/organizacao/cargos';
import { useSessao } from '@/hooks/useSessao';
import { destinoDaSessao } from '@/state/destino';

export const AVISO_KYC =
  'A tua identidade ainda não foi verificada. Até lá só tens acesso ao Mapa e às Definições.';

/**
 * Separadores. Só existem os que useCargos/decidirAcesso permitem: os outros
 * ficam "protegidos" (não aparecem e não se abrem nem por link).
 */
export default function LayoutSeparadores() {
  const estado = useSessao();
  const destino = destinoDaSessao(estado);
  if (destino === 'carregar') return <EcraCarregamento />;
  // Sem sessão → Entrar; falta MFA → ecrã do código.
  if (destino !== '/mapa') return <Redirect href={destino} />;

  const { separadores, restricao } = estado.acesso;
  return (
    <View style={estilos.ecra}>
      {restricao === 'kyc' ? (
        <SafeAreaView edges={['top']} style={estilos.aviso}>
          <Text accessibilityRole="alert" style={estilos.textoAviso}>
            {AVISO_KYC}
          </Text>
        </SafeAreaView>
      ) : null}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: CORES.primaria,
          tabBarInactiveTintColor: CORES.inativo,
          tabBarLabelStyle: estilos.nome,
          tabBarStyle: estilos.barra,
        }}
      >
        {SEPARADORES.map((s) => (
          <Tabs.Protected key={s} guard={separadores.includes(s)}>
            <Tabs.Screen
              name={s}
              options={{
                title: NOMES_SEPARADORES[s],
                tabBarAccessibilityLabel: NOMES_SEPARADORES[s],
                tabBarIcon: ({ color }) => <Icone nome={s} cor={color} tamanho={26} />,
              }}
            />
          </Tabs.Protected>
        ))}
      </Tabs>
    </View>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundo },
  aviso: {
    backgroundColor: CORES.avisoFundo,
    borderBottomWidth: 2,
    borderBottomColor: CORES.avisoBorda,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  textoAviso: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: CORES.avisoTexto, paddingTop: 10 },
  nome: { fontSize: 12, fontWeight: '600' },
  barra: { minHeight: 64, paddingTop: 4 },
});
