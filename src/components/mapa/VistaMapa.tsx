import { Camera, Map, Marker, NativeUserLocation, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PontoEncontrado } from '@/hooks/usePesquisaMapa';
import { ATRIBUICAO_OSM, ATRIBUICAO_SATELITE } from '@/services/mapas/estiloMapa';
import { REGIAO_HUAMBO } from '@/services/mapas/regioes';

import { CORES, TAMANHOS } from '../tema';

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
}: Props) {
  const [seguir, setSeguir] = useState(alvo === null);
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
  return (
    <View
      style={[estilos.mapa, altura === 'cheio' ? estilos.cheio : { height: altura }]}
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
              zoom: alvo ? 17 : 16,
            }}
            trackUserLocation={seguir && !semPermissao ? 'default' : undefined}
            onTrackUserLocationChange={(e) => {
              if (!e.nativeEvent.trackUserLocation) setSeguir(false);
            }}
          />
          {!semPermissao ? <NativeUserLocation /> : null}
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

      {estilo ? (
        <View style={estilos.zoom} accessibilityRole="group" accessibilityLabel="Controlos de zoom">
          <Pressable accessibilityRole="button" accessibilityLabel="Aumentar zoom" onPress={() => camara.current?.zoomTo(18, 250)} style={estilos.zoomBotao}>
            <Text style={estilos.zoomTexto}>+</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Diminuir zoom" onPress={() => camara.current?.zoomTo(14, 250)} style={estilos.zoomBotao}>
            <Text style={estilos.zoomTexto}>−</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={estilos.camadas} accessibilityRole="radiogroup">
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
          style={estilos.atribuicao}
          accessibilityLabel={camada === 'satelite' ? 'Imagens de satélite: Esri' : 'Dados do mapa: OpenStreetMap'}
        >
          {camada === 'satelite' ? ATRIBUICAO_SATELITE : ATRIBUICAO_OSM}
        </Text>
      ) : null}

      <View style={estilos.botoesBaixo}>
        {estilo && !seguir && !semPermissao ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Centrar em mim" onPress={() => {
              setSeguir(true);
              if (posicao) camara.current?.flyTo({ center: [posicao.longitude, posicao.latitude], zoom: 16, duration: 500 });
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

      {online === false ? (
        <View style={estilos.faixaSemRede}>
          <Text style={estilos.textoFaixa}>Sem rede: a mostrar o que está neste telemóvel</Text>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  mapa: { backgroundColor: CORES.fundoSuave, borderRadius: 12, overflow: 'hidden' },
  cheio: { flex: 1, borderRadius: 0 },
  semMapa: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  semMapaTexto: { fontSize: TAMANHOS.texto, color: CORES.texto, textAlign: 'center', fontWeight: '600' },
  marcador: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CORES.primaria,
    borderWidth: 0,
  },
  zoom: { position: 'absolute', left: 8, top: 44, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: CORES.borda, backgroundColor: CORES.fundo },
  zoomBotao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: CORES.borda },
  zoomTexto: { fontSize: 28, lineHeight: 30, fontWeight: '700', color: CORES.texto },
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
    backgroundColor: 'rgba(255,255,255,0.85)',
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
  faixaSemRede: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: CORES.avisoFundo, padding: 8 },
  textoFaixa: { color: CORES.avisoTexto, fontWeight: '700', textAlign: 'center', fontSize: 15 },
});
