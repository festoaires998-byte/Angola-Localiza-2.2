import { Camera, Map, NativeUserLocation } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Cartao, Linha, Subtitulo, Texto } from '@/components/ui';
import { dataHora, megas, textoPrecisao } from '@/components/nomes';
import { situacaoLimite } from '@/domain/enderecamento/registoMorada';
import { encode } from '@/domain/enderecamento/plusCode';
import { useCapturaGps, type CapturaGps } from '@/hooks/useCapturaGps';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useMapaOffline } from '@/hooks/useMapaOffline';
import { useOnline } from '@/hooks/useOnline';
import { usePosicao } from '@/hooks/usePosicao';
import type { InfoLocal } from '@/services/location/infoLocal';
import { ATRIBUICAO_OSM, criarEstilo } from '@/services/mapas/estiloMapa';
import { mapaHuambo, type EstadoMapaOffline } from '@/services/mapas/mapaOffline';
import { dentroDaRegiao, REGIAO_HUAMBO } from '@/services/mapas/regioes';

/** Onde as camadas do mapa estão: no telemóvel, pela rede, ou em lado nenhum. */
function origemDoMapa(estado: EstadoMapaOffline, online: boolean | null) {
  if (estado.estado === 'pronto') {
    return { tiles: mapaHuambo.urlTiles(estado.local, true), ...mapaHuambo.origemRecursos(true) };
  }
  const remoto =
    estado.estado === 'sem_mapa' || estado.estado === 'erro' || estado.estado === 'a_descarregar'
      ? estado.remoto
      : null;
  if (online && remoto) {
    return { tiles: mapaHuambo.urlTiles(remoto, false), ...mapaHuambo.origemRecursos(false) };
  }
  return null;
}

function CartaoMapaOffline({ estado, online }: { estado: EstadoMapaOffline; online: boolean | null }) {
  const [erroAtualizar, setErroAtualizar] = useState<string | null>(null);
  const descarregar = () => {
    setErroAtualizar(null);
    mapaHuambo.descarregar().catch((e: unknown) => setErroAtualizar(e instanceof Error ? e.message : String(e)));
  };

  if (estado.estado === 'a_verificar') return null;
  if (estado.estado === 'pronto') {
    if (!estado.novo) return null;
    return (
      <Cartao>
        <Texto>{`Há uma versão nova do mapa do Huambo (${megas(estado.novo.bytes)}).`}</Texto>
        {erroAtualizar ? <Caixa tipo="erro">{erroAtualizar}</Caixa> : null}
        {online ? <Botao titulo="Atualizar o mapa" variante="secundario" onPress={descarregar} /> : null}
      </Cartao>
    );
  }
  if (estado.estado === 'a_descarregar') {
    return (
      <Cartao>
        <Subtitulo>A descarregar o mapa…</Subtitulo>
        <View style={estilos.barra} accessibilityRole="progressbar">
          <View style={[estilos.barraCheia, { width: `${Math.round(estado.progresso * 100)}%` }]} />
        </View>
        <Texto>{`${Math.round(estado.progresso * 100)}% de ${megas(estado.remoto.bytes)}`}</Texto>
      </Cartao>
    );
  }
  const remoto = estado.remoto;
  return (
    <Cartao>
      <Subtitulo>Mapa para usar sem rede</Subtitulo>
      <Texto>
        {remoto
          ? `Descarrega o mapa de ${REGIAO_HUAMBO.nome} (${megas(remoto.bytes)}) para o veres mesmo sem internet.`
          : `Descarrega o mapa de ${REGIAO_HUAMBO.nome} para o veres mesmo sem internet.`}
      </Texto>
      {estado.estado === 'erro' ? <Caixa tipo="erro">{estado.mensagem}</Caixa> : null}
      {online ? (
        <Botao
          titulo={estado.estado === 'erro' ? 'Tentar outra vez' : 'Descarregar mapa'}
          onPress={descarregar}
        />
      ) : (
        <Caixa tipo="info">Sem rede. Liga-te à internet (de preferência Wi-Fi) para descarregar o mapa.</Caixa>
      )}
    </Cartao>
  );
}

function CartaoOndeEstou({ medida, comSinal, info, online }: { medida: CapturaGps; comSinal: boolean; info: InfoLocal | null; online: boolean | null }) {
  const captura = medida.captura;
  if (!captura) {
    return (
      <Cartao>
        <Subtitulo>Onde estou</Subtitulo>
        <Texto>
          {comSinal
            ? `A medir a tua posição… leitura ${medida.leiturasBoas} de ${medida.necessarias} com menos de ±${medida.limite} m. Fica parado uns segundos.`
            : 'A procurar o sinal do GPS… Se demorar, vai para um sítio aberto.'}
        </Texto>
        {comSinal && medida.melhorAteAgora !== null ? (
          <Text style={estilos.nota}>{`Melhor até agora: ± ${Math.round(medida.melhorAteAgora)} m.`}</Text>
        ) : null}
      </Cartao>
    );
  }
  const precisao = textoPrecisao(captura.precisao);
  // Junto ao limite de duas células, o erro do GPS pode fazer o código trocar com o da vizinha.
  const limite = situacaoLimite(captura.latitude, captura.longitude, captura.precisao);
  const aoLimite = limite.distanciaM;
  const junto = !captura.fraca && limite.junto;
  const cp = info?.codigoPostal;
  const local = info?.local;
  return (
    <Cartao>
      <Subtitulo>Onde estou</Subtitulo>
      <View style={estilos.linha}>
        <Text style={estilos.rotulo}>Plus Code</Text>
        <Text selectable style={estilos.codigo} accessibilityLabel="Plus Code">
          {encode(captura.latitude, captura.longitude)}
        </Text>
      </View>
      <Linha nome="Precisão do GPS" valor={precisao.qualidade ? `${precisao.texto} (${precisao.qualidade})` : precisao.texto} />
      {captura.fraca ? (
        <Text style={[estilos.etiqueta, estilos.provisorio]}>{`Pouco preciso (± ${Math.round(captura.precisao)} m)`}</Text>
      ) : null}
      <Text style={estilos.nota}>
        {captura.fraca
          ? `A tentar ter 3 leituras com menos de ±${medida.limite} m… (${medida.leiturasBoas} de ${medida.necessarias})`
          : medida.aMedir
            ? `A medir de novo… leitura ${medida.leiturasBoas} de ${medida.necessarias}.`
            : `Média de ${captura.leituras} leituras do GPS com menos de ±${medida.limite} m.`}
      </Text>
      {captura.fraca ? (
        <Caixa tipo="aviso">
          <Text style={estilos.textoCaixa}>
            {`Precisão acima de ${medida.limite} m: o código pode não ser o deste ponto. Vai para um sítio aberto (longe de paredes e tetos). O código melhora sozinho.`}
          </Text>
        </Caixa>
      ) : null}

      <View style={estilos.linha}>
        <Text style={estilos.rotulo}>Código Postal Digital</Text>
        {cp?.codigo ? (
          <>
            <Text selectable style={estilos.codigoMedio} accessibilityLabel="Código Postal Digital">
              {cp.codigo}
            </Text>
            <Text style={[estilos.etiqueta, cp.estado === 'confirmado' ? estilos.confirmado : estilos.provisorio]}>
              {cp.estado === 'confirmado' ? 'Confirmado' : 'Provisório'}
            </Text>
            {junto ? (
              <Text style={estilos.nota}>
                {`Estás junto ao limite entre duas células do código postal (a ${Math.max(1, Math.round(aoLimite))} m). Aqui o código pode trocar com o da célula vizinha.`}
              </Text>
            ) : null}
            {cp.estado === 'confirmado' && !online && cp.confirmadoEm ? (
              <Text style={estilos.nota}>{`Sem rede: confirmado pelo servidor a ${dataHora(cp.confirmadoEm)}.`}</Text>
            ) : null}
            {cp.estado === 'provisorio' ? (
              <Text style={estilos.nota}>
                {captura.fraca
                  ? `Por confirmar: a precisão tem de ser melhor que ±${medida.limite} m.`
                  : online
                    ? 'A confirmar com o servidor…'
                    : 'Calculado neste telemóvel. É confirmado quando houver rede.'}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={estilos.nota}>
            {cp?.estado === 'indisponivel' ? 'Indisponível neste ponto.' : '…'}
          </Text>
        )}
      </View>

      <Linha nome="Província" valor={local?.provincia ?? '—'} />
      <Linha nome="Município" valor={local?.municipio ?? '—'} />
      {local?.origem === 'guardado' && !online ? (
        <Text style={estilos.nota}>{`Sem rede: guardado a ${dataHora(local.atualizadoEm)}.`}</Text>
      ) : null}
      {local?.origem === 'perto' ? (
        <Text style={estilos.nota}>Sem rede: é o de uma zona perto daqui (pode estar errado junto aos limites).</Text>
      ) : null}
      {local && local.origem === null ? (
        <Text style={estilos.nota}>
          {online ? 'A perguntar ao servidor…' : 'Sem rede e sem dados guardados desta zona.'}
        </Text>
      ) : null}
      {!medida.aMedir ? <Botao titulo="Medir de novo" variante="secundario" onPress={medida.medirDeNovo} /> : null}
    </Cartao>
  );
}

export default function Mapa() {
  const online = useOnline();
  const gps = usePosicao();
  const estadoMapa = useMapaOffline(online);
  const [seguir, setSeguir] = useState(true);

  const aoVivo = gps.estado === 'ok' ? gps.posicao : null;
  // O ponto azul segue o GPS ao vivo; o código usa a posição medida (média de várias leituras).
  const medida = useCapturaGps(aoVivo);
  const posicao = medida.captura ?? aoVivo ?? (gps.estado === 'a_procurar' ? gps.ultima : null);
  // Com mais de ±10 m o código fica provisório (não se pede a confirmação ao servidor).
  const info = useInfoLocal(medida.captura, online, !medida.captura?.fraca);
  const origem = origemDoMapa(estadoMapa, online);
  const chaveOrigem = origem ? `${origem.tiles}|${origem.fontes}` : null;
  // O estilo só muda quando a origem muda (evita recarregar o mapa a cada posição).
  const estilo = useMemo(() => (origem ? criarEstilo(origem) : null), [chaveOrigem]);
  const semPermissao = gps.estado === 'sem_permissao' || gps.estado === 'gps_desligado';

  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <View style={estilos.mapa}>
        {estilo ? (
          <Map mapStyle={estilo} style={StyleSheet.absoluteFill} logo={false} attribution={false} compass>
            <Camera
              initialViewState={{
                center: posicao ? [posicao.longitude, posicao.latitude] : REGIAO_HUAMBO.centro,
                zoom: 15,
              }}
              trackUserLocation={seguir && !semPermissao ? 'default' : undefined}
              onTrackUserLocationChange={(e) => {
                if (!e.nativeEvent.trackUserLocation) setSeguir(false);
              }}
            />
            {!semPermissao ? <NativeUserLocation /> : null}
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
          <Text style={estilos.atribuicao} accessibilityLabel="Dados do mapa: OpenStreetMap">
            {ATRIBUICAO_OSM}
          </Text>
        ) : null}
        {estilo && !seguir && !semPermissao ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Centrar em mim"
            onPress={() => setSeguir(true)}
            style={estilos.botaoCentrar}
          >
            <Text style={estilos.textoCentrar}>Centrar em mim</Text>
          </Pressable>
        ) : null}
        {online === false ? (
          <View style={estilos.faixaSemRede}>
            <Text style={estilos.textoFaixa}>Sem rede: a mostrar o que está neste telemóvel</Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={estilos.painel} contentContainerStyle={estilos.painelConteudo}>
        {gps.estado === 'sem_permissao' ? (
          <Caixa tipo="aviso">
            <Text style={estilos.textoCaixa}>
              Sem autorização para usar a localização. Sem ela não conseguimos mostrar onde estás nem o teu
              código.
            </Text>
            <Botao titulo="Autorizar localização" onPress={gps.tentarDeNovo} />
          </Caixa>
        ) : null}
        {gps.estado === 'gps_desligado' ? (
          <Caixa tipo="aviso">
            <Text style={estilos.textoCaixa}>O GPS (localização) está desligado. Liga-o nas definições do telemóvel.</Text>
            <Botao titulo="Tentar outra vez" onPress={gps.tentarDeNovo} />
          </Caixa>
        ) : null}
        {!semPermissao ? <CartaoOndeEstou medida={medida} comSinal={aoVivo !== null} info={info} online={online} /> : null}
        {posicao && !dentroDaRegiao(REGIAO_HUAMBO, posicao.latitude, posicao.longitude) ? (
          <Caixa tipo="info">{`Estás fora da zona do mapa (${REGIAO_HUAMBO.nome}). O teu código continua a funcionar.`}</Caixa>
        ) : null}
        <CartaoMapaOffline estado={estadoMapa} online={online} />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundo },
  mapa: { flex: 1, minHeight: 220, backgroundColor: CORES.fundoSuave },
  semMapa: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  semMapaTexto: { fontSize: TAMANHOS.texto, color: CORES.texto, textAlign: 'center', fontWeight: '600' },
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
  botaoCentrar: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: CORES.primaria,
    borderRadius: 24,
  },
  textoCentrar: { color: CORES.sobrePrimaria, fontSize: 16, fontWeight: '700' },
  faixaSemRede: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: CORES.avisoFundo, padding: 8 },
  textoFaixa: { color: CORES.avisoTexto, fontWeight: '700', textAlign: 'center', fontSize: 15 },
  painel: { maxHeight: '55%', borderTopWidth: 1, borderTopColor: CORES.borda },
  painelConteudo: { padding: 16, gap: 12 },
  linha: { gap: 2 },
  rotulo: { fontSize: 15, color: CORES.textoSuave },
  codigo: { fontSize: 28, fontWeight: '700', color: CORES.texto, letterSpacing: 1 },
  codigoMedio: { fontSize: 20, fontWeight: '700', color: CORES.texto },
  etiqueta: {
    alignSelf: 'flex-start',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  provisorio: { backgroundColor: CORES.avisoFundo, color: CORES.avisoTexto },
  confirmado: { backgroundColor: '#E6F4EA', color: CORES.sucesso },
  nota: { fontSize: 15, lineHeight: 21, color: CORES.textoSuave },
  textoCaixa: { fontSize: 16, lineHeight: 22, color: CORES.texto, fontWeight: '600' },
  barra: { height: 12, borderRadius: 6, backgroundColor: CORES.fundoSuave, overflow: 'hidden' },
  barraCheia: { height: 12, backgroundColor: CORES.primaria },
});
