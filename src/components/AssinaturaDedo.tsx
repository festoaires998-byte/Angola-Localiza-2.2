import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { assinaturaValida, caminhoSvg, type Traco } from '@/domain/entregas/assinaturaDedo';

import { CORES, TAMANHOS } from './tema';
import { Botao, Caixa, Texto } from './ui';

interface Props {
  /** URI da assinatura já gravada (PNG), para mostrar. */
  assinatura: string | null;
  /** Grava a assinatura (PNG) e devolve quando estiver pronta, ou falha com a mensagem. */
  aoConfirmar(tracos: Traco[], largura: number, altura: number): Promise<void>;
  aoApagar(): void;
}

const ALTURA = 220;

/** Quadro onde quem recebe assina com o dedo. */
export function AssinaturaDedo({ assinatura, aoConfirmar, aoApagar }: Props) {
  const [tracos, setTracos] = useState<Traco[]>([]);
  const [largura, setLargura] = useState(0);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atual = useRef<Traco | null>(null);

  const gestos = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Enquanto assina, o ecrã não se desloca.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          atual.current = [{ x, y }];
          setTracos((t) => [...t, atual.current!]);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (!atual.current) return;
          atual.current = [...atual.current, { x, y }];
          const traco = atual.current;
          setTracos((t) => [...t.slice(0, -1), traco]);
        },
        onPanResponderRelease: () => {
          atual.current = null;
        },
      }),
    [],
  );

  if (assinatura) {
    return (
      <View style={estilos.bloco}>
        <Image source={{ uri: assinatura }} style={estilos.imagem} resizeMode="contain" accessibilityLabel="Assinatura de quem recebe" />
        <Botao titulo="Assinar de novo" variante="secundario" onPress={aoApagar} />
      </View>
    );
  }

  const valida = assinaturaValida(tracos);
  return (
    <View style={estilos.bloco}>
      <Texto suave>Pede a quem recebe para assinar no quadro com o dedo.</Texto>
      <View
        style={estilos.quadro}
        onLayout={(e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width)}
        accessibilityLabel="Quadro da assinatura"
        testID="quadro-assinatura"
        {...gestos.panHandlers}
      >
        <Svg width="100%" height={ALTURA}>
          <Path d={caminhoSvg(tracos)} stroke={CORES.texto} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao
        titulo="Confirmar a assinatura"
        desativado={!valida}
        aCarregar={aGravar}
        onPress={async () => {
          setErro(null);
          setAGravar(true);
          try {
            await aoConfirmar(tracos, largura, ALTURA);
            setTracos([]);
          } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
          } finally {
            setAGravar(false);
          }
        }}
      />
      <Botao titulo="Limpar" variante="secundario" desativado={tracos.length === 0} onPress={() => setTracos([])} />
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 10 },
  quadro: {
    height: ALTURA,
    borderWidth: 2,
    borderColor: CORES.borda,
    borderRadius: TAMANHOS.raio,
    backgroundColor: CORES.fundo,
    overflow: 'hidden',
  },
  imagem: { height: ALTURA, borderWidth: 1, borderColor: CORES.borda, borderRadius: TAMANHOS.raio, backgroundColor: '#FFFFFF' },
});
