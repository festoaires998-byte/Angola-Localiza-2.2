import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PontoEncontrado } from '@/hooks/usePesquisaMapa';
import { CORES, TAMANHOS } from '../tema';

export type Camada = 'mapa' | 'satelite';

interface Props {
  estilo: unknown | null;
  camada: Camada;
  aoEscolherCamada(camada: Camada): void;
  online: boolean | null;
  posicao: { latitude: number; longitude: number } | null;
  semPermissao: boolean;
  alvo: PontoEncontrado | null;
  altura: number | 'cheio';
  aoTocar?(tocar: boolean): void;
  botaoCanto: { titulo: string; aoCarregar(): void };
}

/**
 * Implementação Web separada do MapLibre Native.
 * @maplibre/maplibre-react-native é nativo (Android/iOS); no browser usamos
 * o mapa embutido do OpenStreetMap para manter a página interativa.
 */
export function VistaMapa({
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
  const [zoom, setZoom] = useState(16);
  const centro = alvo ?? posicao;
  const lat = centro?.latitude ?? -8.839;
  const lon = centro?.longitude ?? 13.289;
  const iframeUrl = useMemo(() => {
    const delta = 360 / Math.pow(2, Math.max(8, Math.min(18, zoom)));
    const left = lon - delta;
    const right = lon + delta;
    const top = lat + delta;
    const bottom = lat - delta;
    return 'https://www.openstreetmap.org/export/embed.html?' +
      new URLSearchParams({
        bbox: [left, bottom, right, top].map(String).join(','),
        layer: 'mapnik',
        marker: lat + ',' + lon,
      }).toString();
  }, [lat, lon, zoom]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('localiza-web-map');
    if (!host) return;
    host.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = iframeUrl;
    iframe.title = alvo ? 'Mapa do local selecionado' : 'Mapa Localiza';
    iframe.setAttribute('loading', 'eager');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    Object.assign(iframe.style, {
      width: '100%', height: '100%', border: '0', display: 'block',
    });
    host.appendChild(iframe);
    return () => { host.innerHTML = ''; };
  }, [iframeUrl, alvo]);

  return (
    <View
      style={[estilos.mapa, altura === 'cheio' ? estilos.cheio : { height: altura }]}
      onTouchStart={() => aoTocar?.(true)}
      onTouchEnd={() => aoTocar?.(false)}
      onTouchCancel={() => aoTocar?.(false)}
    >
      <View nativeID="localiza-web-map" style={StyleSheet.absoluteFill} />
      <View style={estilos.controles}>
        <Pressable accessibilityRole="button" accessibilityLabel="Aumentar zoom" onPress={() => setZoom((z) => Math.min(18, z + 1))} style={estilos.botao}>
          <Text style={estilos.texto}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Diminuir zoom" onPress={() => setZoom((z) => Math.max(8, z - 1))} style={estilos.botao}>
          <Text style={estilos.texto}>−</Text>
        </Pressable>
      </View>
      <View style={estilos.camadas}>
        <Pressable accessibilityRole="radio" accessibilityLabel="Vista: Mapa" onPress={() => aoEscolherCamada('mapa')} style={[estilos.camada, camada === 'mapa' && estilos.ativa]}>
          <Text style={[estilos.textoCamada, camada === 'mapa' && estilos.textoAtivo]}>Mapa</Text>
        </Pressable>
        <Pressable accessibilityRole="radio" accessibilityLabel="Vista: Satélite" onPress={() => aoEscolherCamada('satelite')} style={[estilos.camada, camada === 'satelite' && estilos.ativa]}>
          <Text style={[estilos.textoCamada, camada === 'satelite' && estilos.textoAtivo]}>Satélite</Text>
        </Pressable>
      </View>
      {alvo ? <View style={estilos.ficha}><Text style={estilos.fichaTitulo}>{alvo.titulo}</Text><Text>{alvo.latitude.toFixed(5)}, {alvo.longitude.toFixed(5)}</Text></View> : null}
      <View style={estilos.botoes}>
        <Pressable accessibilityRole="button" accessibilityLabel={botaoCanto.titulo} onPress={botaoCanto.aoCarregar} style={estilos.botaoAcao}>
          <Text style={estilos.textoAcao}>{botaoCanto.titulo}</Text>
        </Pressable>
      </View>
      {semPermissao ? <View style={estilos.aviso}><Text style={estilos.avisoTexto}>Localização indisponível neste navegador.</Text></View> : null}
      {online === false ? <View style={estilos.offline}><Text style={estilos.avisoTexto}>Sem rede: a mostrar o mapa online disponível.</Text></View> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  mapa: { backgroundColor: CORES.fundoSuave, borderRadius: 12, overflow: 'hidden', minHeight: 320 },
  cheio: { flex: 1, borderRadius: 0 },
  controles: { position: 'absolute', left: 8, top: 44, gap: 4 },
  botao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: CORES.fundo, borderRadius: 8, borderWidth: 1, borderColor: CORES.borda },
  texto: { fontSize: 28, fontWeight: '700', color: CORES.texto },
  camadas: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', borderRadius: 12, borderWidth: 2, borderColor: CORES.primaria, backgroundColor: CORES.fundo, overflow: 'hidden' },
  camada: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
  ativa: { backgroundColor: CORES.primaria },
  textoCamada: { fontSize: 16, fontWeight: '700', color: CORES.primaria },
  textoAtivo: { color: CORES.sobrePrimaria },
  ficha: { position: 'absolute', left: 10, top: 68, maxWidth: '62%', padding: 10, borderRadius: 10, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda },
  fichaTitulo: { fontWeight: '700', color: CORES.texto },
  botoes: { position: 'absolute', right: 8, bottom: 28 },
  botaoAcao: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: CORES.primaria, borderRadius: 24 },
  textoAcao: { color: CORES.sobrePrimaria, fontSize: 16, fontWeight: '700' },
  aviso: { position: 'absolute', top: 0, left: 0, right: 0, padding: 8, backgroundColor: CORES.avisoFundo },
  offline: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: CORES.avisoFundo },
  avisoTexto: { color: CORES.avisoTexto, fontWeight: '700', textAlign: 'center', fontSize: TAMANHOS.textoPequeno },
});
