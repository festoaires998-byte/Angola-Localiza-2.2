import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Icone } from '@/components/Icone';
import { NOMES_SEPARADORES } from '@/components/nomes';
import { sombraCartao, type Cores } from '@/components/tema';
import { useEstilos, useCores } from '@/components/temaApp';
import { EcraCarregamento } from '@/components/ui';
import { SEPARADORES } from '@/domain/organizacao/cargos';
import { useSessao } from '@/hooks/useSessao';
import { destinoDaSessao } from '@/state/destino';

export const AVISO_KYC =
  'A tua identidade ainda não foi verificada. Até lá só tens acesso ao Início, ao Mapa e à Conta.';

/**
 * Separadores. Só existem os que useCargos/decidirAcesso permitem: os outros
 * ficam "protegidos" (não aparecem e não se abrem nem por link).
 */
export default function LayoutSeparadores() {
  const estilos = useEstilos(fabricaEstilos);
  const CORES = useCores();
  const insets = useSafeAreaInsets();
  const estado = useSessao();
  const destino = destinoDaSessao(estado);
  if (destino === 'carregar') return <EcraCarregamento />;
  // Sem sessão → Entrar; falta MFA → ecrã do código.
  if (destino !== '/inicio') return <Redirect href={destino} />;

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
          // Barra a "flutuar": afastada das margens, cantos redondos e sombra.
          tabBarStyle: [estilos.barra, { marginBottom: Math.max(insets.bottom, 10), height: 70 }],
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
                // As moradas abrem-se no Início ("As minhas moradas"): a barra fica com 5 botões e o Enviar ao meio.
                ...(s === 'guardados' ? { href: null } : {}),
                tabBarAccessibilityLabel: NOMES_SEPARADORES[s],
                tabBarButtonTestID: `aba-${s}`,
                // "Enviar" é o botão amarelo grande no meio; nos outros, o
                // separador ativo fica numa pastilha amarelo-sol.
                tabBarIcon: ({ color, focused }) =>
                  s === 'entrega' ? (
                    <View testID="botao-enviar" style={estilos.botaoEnviar}>
                      <Svg width={28} height={28} viewBox="0 0 24 24" accessibilityElementsHidden>
                        <Path d="M12 5v14M5 12h14" stroke={CORES.sobreDestaque} strokeWidth={2.8} strokeLinecap="round" />
                      </Svg>
                    </View>
                  ) : (
                    <View testID={focused ? `aba-ativa-${s}` : undefined} style={[estilos.pastilha, focused && estilos.pastilhaAtiva]}>
                      <Icone nome={s} cor={color} tamanho={24} fundo={focused ? CORES.destaqueFundo : CORES.fundo} />
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

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
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
  barra: {
    marginHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 26,
    borderTopWidth: 0,
    borderWidth: CORES.fundo === '#FFFFFF' ? 0 : 1,
    borderColor: CORES.bordaCartao,
    backgroundColor: CORES.fundo,
    ...sombraCartao(CORES),
    shadowOpacity: 0.16,
    elevation: 10,
  },
  botaoEnviar: {
    width: 58,
    height: 58,
    marginTop: -30,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: CORES.fundoEcra,
    backgroundColor: CORES.destaque,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CORES.destaque,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
