import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconeSeccao, type NomeSeccao } from './IconeSeccao';
import { sombraCartao, TAMANHOS, type CorPastilha, type Cores } from './tema';
import { useCores, useEstilos, useTema } from './temaApp';

/** Vibração curta ao tocar num botão (se o telemóvel a tiver; nunca falha). */
export function vibrarToque(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Vibração de "ficou feito" (ex.: morada guardada, envio criado). */
export function vibrarSucesso(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Ecrã com margens, deslocável e que sobe com o teclado. */
export function Ecra({ children, centrado = false }: { children: ReactNode; centrado?: boolean }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={estilos.ecra} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[estilos.conteudo, centrado && estilos.centrado]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Título do ecrã: faixa verde com letra branca e um traço amarelo-sol. */
export function Titulo({ children }: { children: ReactNode }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <View style={estilos.faixaTitulo}>
      <View style={estilos.circuloSol} />
      <Text accessibilityRole="header" style={estilos.titulo}>
        {children}
      </Text>
      <View style={estilos.tracoSol} />
    </View>
  );
}

export function Subtitulo({ children }: { children: ReactNode }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <Text accessibilityRole="header" style={estilos.subtitulo}>
      {children}
    </Text>
  );
}

export function Texto({ children, suave = false }: { children: ReactNode; suave?: boolean }) {
  const estilos = useEstilos(fabricaEstilos);
  return <Text style={[estilos.texto, suave && estilos.textoSuave]}>{children}</Text>;
}

interface PropsCampo extends TextInputProps {
  rotulo: string;
}

/** Caixa de texto grande, com o nome por cima. */
export function Campo({ rotulo, style, ...resto }: PropsCampo) {
  const estilos = useEstilos(fabricaEstilos);
  const cores = useCores();
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        accessibilityLabel={rotulo}
        placeholderTextColor={cores.inativo}
        style={[estilos.entrada, style]}
        {...resto}
      />
    </View>
  );
}

type Variante = 'primario' | 'secundario' | 'perigo';

interface PropsBotao {
  titulo: string;
  onPress(): void;
  variante?: Variante;
  desativado?: boolean;
  /** Mostra uma roda a girar e fica desativado. */
  aCarregar?: boolean;
}

/** Botão grande, a toda a largura. "Afunda" um pouco e vibra ao tocar. */
export function Botao({ titulo, onPress, variante = 'primario', desativado, aCarregar }: PropsBotao) {
  const estilos = useEstilos(fabricaEstilos);
  const cores = useCores();
  const inativo = !!desativado || !!aCarregar;
  const corTexto = variante === 'primario' ? cores.sobrePrimaria : variante === 'perigo' ? cores.perigo : cores.primaria;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inativo, busy: !!aCarregar }}
      disabled={inativo}
      onPress={() => { vibrarToque(); onPress(); }}
      style={({ pressed }) => [
        estilos.botao,
        variante === 'primario' ? estilos.botaoPrimario : estilos.botaoContorno,
        variante === 'perigo' && estilos.botaoPerigo,
        inativo && estilos.botaoInativo,
        pressed && estilos.botaoPremido,
      ]}
    >
      {aCarregar ? <ActivityIndicator color={corTexto} /> : null}
      <Text style={[estilos.textoBotao, { color: corTexto }]}>{titulo}</Text>
    </Pressable>
  );
}

/** Texto sublinhado que se carrega (ex.: "Criar conta"). Área de toque grande. */
export function Ligacao({ titulo, onPress }: { titulo: string; onPress(): void }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={titulo}
      onPress={onPress}
      hitSlop={8}
      style={estilos.ligacao}
    >
      <Text style={estilos.textoLigacao}>{titulo}</Text>
    </Pressable>
  );
}

/** Caixa de marcar grande (ex.: "Esta rua não tem nome"). Área de toque de 48 px. */
export function Marcar({ rotulo, marcado, aoMudar }: { rotulo: string; marcado: boolean; aoMudar(novo: boolean): void }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={rotulo}
      accessibilityState={{ checked: marcado }}
      onPress={() => aoMudar(!marcado)}
      hitSlop={4}
      style={estilos.marcar}
    >
      <View style={[estilos.quadrado, marcado && estilos.quadradoMarcado]}>
        {marcado ? <Text style={estilos.visto}>✓</Text> : null}
      </View>
      <Text style={estilos.textoMarcar}>{rotulo}</Text>
    </Pressable>
  );
}

type TipoCaixa = 'erro' | 'aviso' | 'info' | 'sucesso';

/** Caixa de mensagem com fundo colorido e texto escuro. */
export function Caixa({ tipo, children }: { tipo: TipoCaixa; children: ReactNode }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <View
      accessibilityRole={tipo === 'erro' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[estilos.caixa, estilos[`caixa_${tipo}`]]}
    >
      {typeof children === 'string' ? <Text style={[estilos.textoCaixa, tipo === 'aviso' && estilos.textoAviso]}>{children}</Text> : children}
    </View>
  );
}

/** Cartão branco, cantos redondos e sombra suave (no modo escuro, uma borda fina). */
export function Cartao({ children }: { children: ReactNode }) {
  const estilos = useEstilos(fabricaEstilos);
  return <View style={estilos.cartao}>{children}</View>;
}

/** Título de um cartão com um ícone numa pastilha de cor (ex.: secções da Conta). */
export function CabecalhoCartao({ titulo, icone, cor }: { titulo: string; icone: NomeSeccao; cor: CorPastilha }) {
  const estilos = useEstilos(fabricaEstilos);
  const { pastilhas } = useTema();
  const [corIcone, fundo] = pastilhas[cor];
  return (
    <View style={estilos.cabecalhoCartao}>
      <View style={[estilos.pastilha, { backgroundColor: fundo }]}>
        <IconeSeccao nome={icone} cor={corIcone} />
      </View>
      <Text accessibilityRole="header" style={[estilos.subtitulo, estilos.flex1]}>
        {titulo}
      </Text>
    </View>
  );
}

/** Linha "nome: valor" dentro de um cartão. */
export function Linha({ nome, valor }: { nome: string; valor: string }) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <View style={estilos.linha}>
      <Text style={estilos.linhaNome}>{nome}</Text>
      <Text style={estilos.linhaValor}>{valor}</Text>
    </View>
  );
}

/** Enquanto a sessão guardada é lida. */
export function EcraCarregamento({ texto = 'A abrir…' }: { texto?: string }) {
  const estilos = useEstilos(fabricaEstilos);
  const cores = useCores();
  return (
    <View style={[estilos.ecra, estilos.carregamento]} accessibilityLabel={texto}>
      <ActivityIndicator size="large" color={cores.primaria} />
      <Text style={estilos.subtitulo}>{texto}</Text>
    </View>
  );
}

const fabricaEstilos = (CORES: Cores) => {
  const escuro = CORES.fundo !== '#FFFFFF';
  return StyleSheet.create({
    ecra: { flex: 1, backgroundColor: CORES.fundoEcra },
    conteudo: { padding: TAMANHOS.margem, gap: 16, paddingBottom: 120 },
    centrado: { flexGrow: 1, justifyContent: 'center' },
    carregamento: { alignItems: 'center', justifyContent: 'center', gap: 16 },
    faixaTitulo: {
      backgroundColor: CORES.faixa,
      borderRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
      gap: 10,
      overflow: 'hidden',
    },
    // Círculo amarelo-sol meio escondido no canto da faixa (só enfeite).
    circuloSol: {
      position: 'absolute',
      right: -36,
      top: -44,
      width: 130,
      height: 130,
      borderRadius: 65,
      borderWidth: 18,
      borderColor: 'rgba(246, 184, 0, 0.22)',
    },
    titulo: { fontSize: TAMANHOS.titulo, fontWeight: '800', color: CORES.sobreFaixa, letterSpacing: -0.3 },
    tracoSol: { width: 44, height: 5, borderRadius: 3, backgroundColor: CORES.destaque },
    subtitulo: { fontSize: TAMANHOS.subtitulo, fontWeight: '800', color: CORES.texto, letterSpacing: -0.2 },
    texto: { fontSize: TAMANHOS.texto, lineHeight: 26, color: CORES.texto },
    textoSuave: { color: CORES.textoSuave, fontSize: TAMANHOS.textoPequeno },
    campo: { gap: 6 },
    rotulo: { fontSize: TAMANHOS.textoPequeno, fontWeight: '700', color: CORES.texto },
    entrada: {
      minHeight: TAMANHOS.alturaBotao,
      borderWidth: 2,
      borderColor: CORES.borda,
      borderRadius: TAMANHOS.raio,
      paddingHorizontal: 16,
      fontSize: TAMANHOS.texto,
      color: CORES.texto,
      backgroundColor: CORES.fundo,
    },
    botao: {
      minHeight: TAMANHOS.alturaBotao,
      borderRadius: TAMANHOS.raio,
      paddingHorizontal: 18,
      paddingVertical: 12,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botaoPrimario: { backgroundColor: CORES.primaria, ...sombraCartao(CORES) },
    botaoContorno: { backgroundColor: CORES.fundo, borderWidth: 2, borderColor: CORES.primaria },
    botaoPerigo: { borderColor: CORES.perigo },
    botaoInativo: { opacity: 0.55 },
    botaoPremido: { opacity: 0.9, transform: [{ scale: 0.97 }] },
    textoBotao: { fontSize: TAMANHOS.texto, fontWeight: '800', textAlign: 'center' },
    ligacao: { minHeight: 48, justifyContent: 'center' },
    textoLigacao: {
      fontSize: TAMANHOS.texto,
      fontWeight: '700',
      color: CORES.primaria,
      textDecorationLine: 'underline',
    },
    marcar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
    quadrado: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: CORES.primaria,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: CORES.fundo,
    },
    quadradoMarcado: { backgroundColor: CORES.primaria },
    visto: { color: CORES.sobrePrimaria, fontSize: 18, fontWeight: '800' },
    textoMarcar: { flex: 1, fontSize: TAMANHOS.texto, color: CORES.texto, fontWeight: '600' },
    caixa: { borderRadius: TAMANHOS.raio, borderWidth: 2, padding: 14, gap: 10 },
    caixa_erro: { backgroundColor: CORES.erroFundo, borderColor: CORES.perigo },
    caixa_aviso: { backgroundColor: CORES.avisoFundo, borderColor: CORES.avisoBorda },
    caixa_info: { backgroundColor: CORES.infoFundo, borderColor: CORES.primaria },
    caixa_sucesso: { backgroundColor: CORES.sucessoFundo, borderColor: CORES.sucesso },
    textoCaixa: { fontSize: TAMANHOS.textoPequeno, lineHeight: 24, color: CORES.texto, fontWeight: '600' },
    textoAviso: { color: CORES.avisoTexto },
    cartao: {
      borderRadius: TAMANHOS.raioCartao,
      padding: 18,
      gap: 12,
      backgroundColor: CORES.fundo,
      borderWidth: escuro ? 1 : 0,
      borderColor: CORES.bordaCartao,
      ...sombraCartao(CORES),
    },
    cabecalhoCartao: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    pastilha: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    flex1: { flex: 1 },
    linha: { gap: 2 },
    linhaNome: { fontSize: 15, color: CORES.textoSuave },
    linhaValor: { fontSize: TAMANHOS.texto, fontWeight: '700', color: CORES.texto },
  });
};
