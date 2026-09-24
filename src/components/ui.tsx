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

import { CORES, TAMANHOS } from './tema';

/** Ecrã com margens, deslocável e que sobe com o teclado. */
export function Ecra({ children, centrado = false }: { children: ReactNode; centrado?: boolean }) {
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

export function Titulo({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={estilos.titulo}>
      {children}
    </Text>
  );
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={estilos.subtitulo}>
      {children}
    </Text>
  );
}

export function Texto({ children, suave = false }: { children: ReactNode; suave?: boolean }) {
  return <Text style={[estilos.texto, suave && estilos.textoSuave]}>{children}</Text>;
}

interface PropsCampo extends TextInputProps {
  rotulo: string;
}

/** Caixa de texto grande, com o nome por cima. */
export function Campo({ rotulo, style, ...resto }: PropsCampo) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        accessibilityLabel={rotulo}
        placeholderTextColor={CORES.inativo}
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

/** Botão grande, a toda a largura. */
export function Botao({ titulo, onPress, variante = 'primario', desativado, aCarregar }: PropsBotao) {
  const inativo = !!desativado || !!aCarregar;
  const corTexto = variante === 'primario' ? CORES.sobrePrimaria : variante === 'perigo' ? CORES.perigo : CORES.primaria;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inativo, busy: !!aCarregar }}
      disabled={inativo}
      onPress={onPress}
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
  return (
    <View
      accessibilityRole={tipo === 'erro' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[estilos.caixa, estilos[`caixa_${tipo}`]]}
    >
      {typeof children === 'string' ? <Text style={estilos.textoCaixa}>{children}</Text> : children}
    </View>
  );
}

export function Cartao({ children }: { children: ReactNode }) {
  return <View style={estilos.cartao}>{children}</View>;
}

/** Linha "nome: valor" dentro de um cartão. */
export function Linha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.linhaNome}>{nome}</Text>
      <Text style={estilos.linhaValor}>{valor}</Text>
    </View>
  );
}

/** Enquanto a sessão guardada é lida. */
export function EcraCarregamento({ texto = 'A abrir…' }: { texto?: string }) {
  return (
    <View style={[estilos.ecra, estilos.carregamento]} accessibilityLabel={texto}>
      <ActivityIndicator size="large" color={CORES.primaria} />
      <Text style={estilos.subtitulo}>{texto}</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: TAMANHOS.margem, gap: 16, paddingBottom: 40 },
  centrado: { flexGrow: 1, justifyContent: 'center' },
  carregamento: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  titulo: { fontSize: TAMANHOS.titulo, fontWeight: '700', color: CORES.texto },
  subtitulo: { fontSize: TAMANHOS.subtitulo, fontWeight: '700', color: CORES.texto },
  texto: { fontSize: TAMANHOS.texto, lineHeight: 26, color: CORES.texto },
  textoSuave: { color: CORES.textoSuave, fontSize: TAMANHOS.textoPequeno },
  campo: { gap: 6 },
  rotulo: { fontSize: TAMANHOS.textoPequeno, fontWeight: '600', color: CORES.texto },
  entrada: {
    minHeight: TAMANHOS.alturaBotao,
    borderWidth: 2,
    borderColor: CORES.borda,
    borderRadius: TAMANHOS.raio,
    paddingHorizontal: 14,
    fontSize: TAMANHOS.texto,
    color: CORES.texto,
    backgroundColor: CORES.fundo,
  },
  botao: {
    minHeight: TAMANHOS.alturaBotao,
    borderRadius: TAMANHOS.raio,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPrimario: { backgroundColor: CORES.primaria },
  botaoContorno: { backgroundColor: CORES.fundo, borderWidth: 2, borderColor: CORES.primaria },
  botaoPerigo: { borderColor: CORES.perigo },
  botaoInativo: { opacity: 0.55 },
  botaoPremido: { opacity: 0.8 },
  textoBotao: { fontSize: TAMANHOS.texto, fontWeight: '700', textAlign: 'center' },
  ligacao: { minHeight: 48, justifyContent: 'center' },
  textoLigacao: {
    fontSize: TAMANHOS.texto,
    fontWeight: '600',
    color: CORES.primaria,
    textDecorationLine: 'underline',
  },
  marcar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  quadrado: {
    width: 28,
    height: 28,
    borderRadius: 6,
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
  caixa_sucesso: { backgroundColor: '#E6F4EA', borderColor: CORES.sucesso },
  textoCaixa: { fontSize: TAMANHOS.textoPequeno, lineHeight: 24, color: CORES.texto, fontWeight: '600' },
  cartao: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: TAMANHOS.raio,
    padding: 16,
    gap: 10,
    backgroundColor: CORES.fundo,
  },
  linha: { gap: 2 },
  linhaNome: { fontSize: 15, color: CORES.textoSuave },
  linhaValor: { fontSize: TAMANHOS.texto, fontWeight: '600', color: CORES.texto },
});
