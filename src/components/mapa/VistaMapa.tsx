import { Camera, Map, Marker, NativeUserLocation, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  ORIENTACAO_INICIAL,
  VISTA,
  outraOrientacao,
  rotuloOrientacao,
  seguimentoCamara,
  vistaAoEscolher,
  type Orientacao,
} from '@/domain/mapa/orientacao';

import type { PontoEncontrado } from '@/hooks/usePesquisaMapa';
import { ATRIBUICAO_OSM, ATRIBUICAO_SATELITE } from '@/services/mapas/estiloMapa';
import { REGIAO_HUAMBO } from '@/services/mapas/regioes';

import { TAMANHOS, type Cores } from '../tema';
import { useCores, useEstilos } from '../temaApp';

export type Camada = 'mapa' | 'satelite';

interface Props {
  /** Estilo a mostrar (base ou satélite); null = ainda não há mapa. */
  estilo: StyleSpecification | null;
  camada: Camada;
  aoEscolherCamada(camada: Camada): void;
  online: boolean | null;
  posicao: { latitude: number; longitude: number } | null;
  semPermissao: boolean;
  /** Ponto encontrado (pesquisa ou QR): marcado no mapa e centrado. */
  alvo: PontoEncontrado | null;
  /** Altura fixa (no ecrã do Mapa) ou todo o espaço (ecrã inteiro). */
  altura: number | 'cheio';
  /** Enquanto o dedo está no mapa, o ecrã não faz scroll. */
  aoTocar?(tocar: boolean): void;
  /** Botão do canto: "Ecrã inteiro" (no ecrã) ou "Fechar" (no ecrã inteiro). */
  botaoCanto: { titulo: string; aoCarregar(): void };
  /** Espaço livre em cima (pesquisa a flutuar) e em baixo (folha por cima do mapa). */
  margemTopo?: number;
  margemBaixo?: number;
  /** Mapa de ponta a ponta, sem cantos redondos. */
  semCantos?: boolean;
}

/** O mapa (MapLibre) com o alternador Mapa/Satélite, o ponto azul e o ponto encontrado. */
export function VistaMapa({
  estilo,
  camada,
  aoEscolherCamada,
  online,
  posicao,
  semPermissao,
  alvo,
  altura,
  aoTocar,
  botaoCanto,
  margemTopo = 0,
  margemBaixo = 0,
  semCantos = false,
}: Props) {
  const estilos = useEstilos(fabricaEstilos);
  const cores = useCores();
  const [seguir, setSeguir] = useState(alvo === null);
  const [orientacao, setOrientacao] = useState<Orientacao>(ORIENTACAO_INICIAL);
  const abrirDefinicoesLocalizacao = () => { void Linking.openSettings(); };
  const camara = useRef<CameraRef>(null);

  // Sem ponto encontrado, o mapa volta a seguir a pessoa.
  useEffect(() => {
    if (!alvo) {
      setSeguir(true);
      return;
    }
    setSeguir(false);
    camara.current?.flyTo({ center: [alvo.longitude, alvo.latitude], zoom: 17, duration: 800 });
  }, [alvo?.latitude, alvo?.longitude]);

  const centro = alvo ?? posicao;
  const aoMoverMapa = () => {
    // Qualquer gesto manual assume intenção de exploração; nunca recentramos sem ação explícita.
    setSeguir(false);
  };

  useEffect(() => {
    if (semPermissao) setSeguir(false);
  }, [semPermissao]);

  /** Troca entre "seguir a minha direção" e "Norte para cima"; volta a seguir a pessoa. */
  const mudarOrientacao = () => {
    const nova = outraOrientacao(orientacao);
    setOrientacao(nova);
    const vista = { ...vistaAoEscolher(nova), duration: 500 };
    if (!semPermissao) setSeguir(true);
    void camara.current?.setStop(
      posicao && !semPermissao ? { ...vista, center: [posicao.longitude, posicao.latitude] } : vista,
    );
  };
  const rotulo = rotuloOrientacao(orientacao);
  return (
    <View
      testID="vista-mapa"
      style={[estilos.mapa, altura === 'cheio' ? estilos.cheio : { height: altura }, semCantos && estilos.semCantos]}
      onTouchStart={() => aoTocar?.(true)}
      onTouchEnd={() => aoTocar?.(false)}
      onTouchCancel={() => aoTocar?.(false)}
    >
      {estilo ? (
        <Map mapStyle={estilo} style={StyleSheet.absoluteFill} logo={false} attribution={false} compass>
          <Camera
            ref={camara}
            initialViewState={{
              center: centro ? [centro.longitude, centro.latitude] : REGIAO_HUAMBO.centro,
              zoom: alvo ? 17 : VISTA[orientacao].zoom,
              pitch: alvo || semPermissao ? 0 : VISTA[orientacao].pitch,
            }}
            trackUserLocation={seguimentoCamara(orientacao, seguir && !semPermissao)}
            onTrackUserLocationChange={(e) => {
              if (!e.nativeEvent.trackUserLocation) setSeguir(false);
            }}
          />
          {/* O personagem: ponto com uma seta para onde a pessoa está virada (bússola). */}
          {!semPermissao ? <NativeUserLocation mode="heading" androidPreferredFramesPerSecond={60} /> : null}
          {alvo ? (
            <Marker lngLat={[alvo.longitude, alvo.latitude]} anchor="bottom">
              <View accessibilityLabel={`Ponto encontrado: ${alvo.titulo}`} style={estilos.marcador} />
            </Marker>
          ) : null}
        </Map>
      ) : (
        <View style={estilos.semMapa}>
          <Text style={estilos.semMapaTexto}>
            {online === false
              ? 'O mapa ainda não está neste telemóvel. Liga-te à internet para o descarregar.'
              : 'A preparar o mapa…'}
          </Text>
        </View>
      )}

      {alvo && estilo ? (
        <View style={[estilos.fichaAlvo, { top: 10 + margemTopo }]} accessibilityRole="summary" accessibilityLabel={`Local selecionado: ${alvo.titulo}`}>
          <Text numberOfLines={2} style={estilos.fichaTitulo}>{alvo.titulo}</Text>
          <Text style={estilos.fichaCoordenadas}>{alvo.latitude.toFixed(5)}, {alvo.longitude.toFixed(5)}</Text>
        </View>
      ) : null}

      {estilo ? (
        <View style={[estilos.zoom, { top: (alvo ? 96 : 10) + margemTopo }]} accessibilityLabel="Controlos de zoom">
          <Pressable accessibilityRole="button" accessibilityLabel="Aumentar zoom" onPress={() => camara.current?.zoomTo(18, { duration: 250 })} style={estilos.zoomBotao}>
            <Text style={estilos.zoomTexto}>+</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Diminuir zoom" onPress={() => camara.current?.zoomTo(14, { duration: 250 })} style={estilos.zoomBotao}>
            <Text style={estilos.zoomTexto}>−</Text>
          </Pressable>
        </View>
      ) : null}

      {estilo ? (
        <Pressable
          testID="botao-orientacao"
          accessibilityRole="button"
          accessibilityLabel={rotulo.acessivel}
          onPress={mudarOrientacao}
          style={[estilos.orientacao, { top: (alvo ? 96 : 10) + 104 + margemTopo }, orientacao === 'direcao' && estilos.orientacaoAtiva]}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
            {orientacao === 'direcao' ? (
              <Path d="M12 2l7 19-7-4-7 4z" fill={cores.sobrePrimaria} />
            ) : (
              <>
                <Path d="M12 2l4.5 10h-9z" fill={cores.perigo} />
                <Path d="M7.5 12h9L12 22z" fill={cores.textoSuave} />
              </>
            )}
          </Svg>
          <Text style={[estilos.textoOrientacao, orientacao === 'direcao' && estilos.textoOrientacaoAtiva]}>{rotulo.curto}</Text>
        </Pressable>
      ) : null}

      <View style={[estilos.camadas, { top: 10 + margemTopo }]} accessibilityRole="radiogroup">
        {(['mapa', 'satelite'] as const).map((c) => {
          const ativa = camada === c;
          const nome = c === 'mapa' ? 'Mapa' : 'Satélite';
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={`Vista: ${nome}`}
              accessibilityState={{ selected: ativa, checked: ativa }}
              onPress={() => aoEscolherCamada(c)}
              style={[estilos.camada, ativa && estilos.camadaAtiva]}
            >
              <Text style={[estilos.textoCamada, ativa && estilos.textoCamadaAtiva]}>{nome}</Text>
            </Pressable>
          );
        })}
      </View>

      {estilo ? (
        <Text
          style={[estilos.atribuicao, { bottom: 6 + margemBaixo }]}
          accessibilityLabel={camada === 'satelite' ? 'Imagens de satélite: Esri' : 'Dados do mapa: OpenStreetMap'}
        >
          {camada === 'satelite' ? ATRIBUICAO_SATELITE : ATRIBUICAO_OSM}
        </Text>
      ) : null}

      <View style={[estilos.botoesBaixo, { bottom: 28 + margemBaixo }]}>
        {estilo && !seguir && !semPermissao ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Centrar em mim" onPress={() => {
              setSeguir(true);
              if (posicao) camara.current?.flyTo({ center: [posicao.longitude, posicao.latitude], ...vistaAoEscolher(orientacao), duration: 500 });
            }} style={estilos.botaoMapa}>
            <Text style={estilos.textoBotaoMapa}>Centrar em mim</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={botaoCanto.titulo}
          onPress={botaoCanto.aoCarregar}
          style={estilos.botaoMapa}
        >
          <Text style={estilos.textoBotaoMapa}>{botaoCanto.titulo}</Text>
        </Pressable>
      </View>

      {semPermissao ? (
        <View style={[estilos.faixaLocalizacao, { top: margemTopo }]} accessibilityRole="alert">
          <Text style={estilos.textoFaixa}>Localização indisponível. Ativa a localização nas definições para centrar o mapa em ti.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir definições de localização" onPress={abrirDefinicoesLocalizacao} style={estilos.botaoDefinicoes}>
            <Text style={estilos.textoBotaoDefinicoes}>Abrir definições</Text>
          </Pressable>
        </View>
      ) : null}

      {online === false ? (
        <View style={[estilos.faixaSemRede, { top: margemTopo }]}>
          <Text style={estilos.textoFaixa}>Sem rede: a mostrar o que está neste telemóvel</Text>
        </View>
      ) : null}
    </View>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  mapa: { backgroundColor: CORES.fundoSuave, borderRadius: TAMANHOS.raioCartao, overflow: 'hidden' },
  cheio: { flex: 1, borderRadius: 0 },
  semCantos: { borderRadius: 0 },
  semMapa: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  semMapaTexto: { fontSize: TAMANHOS.texto, color: CORES.texto, textAlign: 'center', fontWeight: '600' },
  marcador: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CORES.primaria,
    borderWidth: 0,
  },
  fichaAlvo: { position: 'absolute', left: 10, top: 10, maxWidth: '62%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  fichaTitulo: { fontSize: 15, fontWeight: '700', color: CORES.texto },
  fichaCoordenadas: { marginTop: 2, fontSize: 12, color: CORES.textoSuave },
  zoom: { position: 'absolute', left: 8, top: 44, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: CORES.borda, backgroundColor: CORES.fundo },
  zoomBotao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: CORES.borda },
  zoomTexto: { fontSize: 28, lineHeight: 30, fontWeight: '700', color: CORES.texto },
  orientacao: {
    position: 'absolute',
    left: 8,
    width: 56,
    minHeight: 56,
    paddingVertical: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CORES.borda,
    backgroundColor: CORES.fundo,
  },
  orientacaoAtiva: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  textoOrientacao: { fontSize: 11, fontWeight: '700', color: CORES.texto, marginTop: 2 },
  textoOrientacaoAtiva: { color: CORES.sobrePrimaria },
  camadas: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: CORES.primaria,
    backgroundColor: CORES.fundo,
    overflow: 'hidden',
  },
  camada: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
  camadaAtiva: { backgroundColor: CORES.primaria },
  textoCamada: { fontSize: 16, fontWeight: '700', color: CORES.primaria },
  textoCamadaAtiva: { color: CORES.sobrePrimaria },
  atribuicao: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    fontSize: 12,
    color: CORES.texto,
    backgroundColor: CORES.fundo + 'D9',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  botoesBaixo: { position: 'absolute', right: 8, bottom: 28, gap: 8, alignItems: 'flex-end' },
  botaoMapa: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: CORES.primaria,
    borderRadius: 24,
  },
  textoBotaoMapa: { color: CORES.sobrePrimaria, fontSize: 16, fontWeight: '700' },
  faixaLocalizacao: { position: 'absolute', top: 0, left: 0, right: 0, padding: 8, backgroundColor: CORES.avisoFundo, alignItems: 'center', gap: 6 },
  botaoDefinicoes: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: CORES.primaria, borderRadius: 20 },
  textoBotaoDefinicoes: { color: CORES.sobrePrimaria, fontWeight: '700' },
  faixaSemRede: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: CORES.avisoFundo, padding: 8 },
  textoFaixa: { color: CORES.avisoTexto, fontWeight: '700', textAlign: 'center', fontSize: 15 },
});
