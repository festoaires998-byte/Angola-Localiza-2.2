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
  'A tua identidade ainda não foi verificada. Até lá só tens acesso ao Mapa e à Conta.';

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
          tabBarStyle: estilos.barra,
          tabBarItemStyle: estilos.item,
          // Com 8 separadores o espaço é curto: a letra encolhe um pouco (até 75%)
          // para o nome caber inteiro, mesmo com a letra do telemóvel aumentada.
          tabBarLabel: ({ color, children }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              maxFontSizeMultiplier={1.2}
              style={[estilos.nome, { color }]}
            >
              {children}
            </Text>
          ),
        }}
      >
        {SEPARADORES.map((s) => (
          <Tabs.Protected key={s} guard={separadores.includes(s)}>
            <Tabs.Screen
              name={s}
              options={{
                title: NOMES_SEPARADORES[s],
                tabBarAccessibilityLabel: NOMES_SEPARADORES[s],
                // O separador ativo fica numa pastilha amarelo-sol.
                tabBarIcon: ({ color, focused }) => (
                  <View testID={focused ? `aba-ativa-${s}` : undefined} style={[estilos.pastilha, focused && estilos.pastilhaAtiva]}>
                    <Icone nome={s} cor={color} tamanho={24} />
                  </View>
                ),
              }}
            />
          </Tabs.Protected>
        ))}
      </Tabs>
    </View>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundoEcra },
  aviso: {
    backgroundColor: CORES.avisoFundo,
    borderBottomWidth: 2,
    borderBottomColor: CORES.avisoBorda,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  textoAviso: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: CORES.avisoTexto, paddingTop: 10 },
  nome: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  pastilha: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pastilhaAtiva: { backgroundColor: CORES.destaqueFundo },
  item: { paddingHorizontal: 0 },
  barra: { minHeight: 64, paddingTop: 4, backgroundColor: CORES.fundo, borderTopColor: CORES.bordaCartao },
});
