import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GuardarFavorito } from '@/components/mapa/GuardarFavorito';
import { LeitorQr } from '@/components/mapa/LeitorQr';
import { QrLocal } from '@/components/mapa/QrLocal';
import { VistaMapa, type Camada } from '@/components/mapa/VistaMapa';
import { dataHora, megas, textoPrecisao } from '@/components/nomes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Campo, Cartao, Linha, Subtitulo, Texto } from '@/components/ui';
import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import { abrirBaseDados } from '@/database/client';
import { criarRepositorioHistoricoLocaliza, type ItemHistoricoLocaliza } from '@/database/repositories/historicoLocaliza';
import { textoCoordenadas, type ResultadoPesquisa } from '@/domain/enderecamento/pesquisa';
import { encode } from '@/domain/enderecamento/plusCode';
import { situacaoLimite } from '@/domain/enderecamento/registoMorada';
import { useCapturaGps, type CapturaGps } from '@/hooks/useCapturaGps';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useMapaOffline } from '@/hooks/useMapaOffline';
import { useOnline } from '@/hooks/useOnline';
import { usePesquisaMapa, type PontoEncontrado } from '@/hooks/usePesquisaMapa';
import { usePosicao } from '@/hooks/usePosicao';
import { useSessao } from '@/hooks/useSessao';
import { CONFIG_AO_OFFLINE_TESTE, nivelLocalidade, nivelPorChave, obterConfigPais } from '@/config/pais';
import { ouvirPais, paisAtual } from '@/state/pais';
import type { InfoLocal } from '@/services/location/infoLocal';
import { criarEstilo, criarEstiloOnlineOSM, criarEstiloSatelite } from '@/services/mapas/estiloMapa';
import { criarMapaDoPais, type EstadoMapaOffline } from '@/services/mapas/mapaOffline';
import { dentroDaRegiao, REGIAO_HUAMBO } from '@/services/mapas/regioes';
import type { Visibilidade } from '@/services/moradas/moradas';
import { mudancasMoradas, servicoMoradas } from '@/services/moradas/moradasApp';
import { podeRegistar, type Verificacao } from '@/services/moradas/registo';
import { servicoRegisto } from '@/services/moradas/registoApp';

/** Onde as camadas do mapa estão: no telemóvel, pela rede, ou em lado nenhum. */
function origemDoMapa(mapa: ReturnType<typeof criarMapaDoPais>, estado: EstadoMapaOffline, online: boolean | null) {
  if (estado.estado === 'pronto') {
    return { tiles: mapa.urlTiles(estado.local, true), ...mapa.origemRecursos(true) };
  }
  const remoto =
    estado.estado === 'sem_mapa' || estado.estado === 'erro' || estado.estado === 'a_descarregar'
      ? estado.remoto
      : null;
  if (online && remoto) {
    return { tiles: mapa.urlTiles(remoto, false), ...mapa.origemRecursos(false) };
  }
  return null;
}

function CartaoMapaOffline({ mapa, estado, online, nomePais }: { mapa: ReturnType<typeof criarMapaDoPais>; estado: EstadoMapaOffline; online: boolean | null; nomePais: string }) {
  const [erroAtualizar, setErroAtualizar] = useState<string | null>(null);
  const descarregar = () => {
    setErroAtualizar(null);
    mapa.descarregar().catch((e: unknown) => setErroAtualizar(e instanceof Error ? e.message : String(e)));
  };

  if (estado.estado === 'a_verificar') return null;
  if (estado.estado === 'pronto') {
    if (!estado.novo) return null;
    return (
      <Cartao>
        <Texto>{`Há uma versão nova do mapa de ${nomePais} (${megas(estado.novo.bytes)}).`}</Texto>
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
          ? `Descarrega o mapa de ${nomePais} (${megas(remoto.bytes)}) para o veres mesmo sem internet.`
          : `Descarrega o mapa de ${nomePais} para o veres mesmo sem internet.`}
      </Texto>
      {estado.estado === 'erro' ? <Caixa tipo="erro">{estado.mensagem}</Caixa> : null}