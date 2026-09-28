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
import { mapaHuambo, type EstadoMapaOffline } from '@/services/mapas/mapaOffline';
import { dentroDaRegiao, REGIAO_HUAMBO } from '@/services/mapas/regioes';
import type { Visibilidade } from '@/services/moradas/moradas';
import { mudancasMoradas, servicoMoradas } from '@/services/moradas/moradasApp';
import { podeRegistar, type Verificacao } from '@/services/moradas/registo';
import { servicoRegisto } from '@/services/moradas/registoApp';

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

/** Passo 3: o cartão com os resultados (Código Postal, Plus Code, divisão, precisão, coordenadas). */
function CartaoOndeEstou({
  medida,
  comSinal,
  info,
  online,
  children,
  rotulos,
}: {
  medida: CapturaGps;
  comSinal: boolean;
  info: InfoLocal | null;
  online: boolean | null;
  /** O QR Code e o "Registar", dentro do mesmo cartão (como no site). */
  children?: ReactNode;
  rotulos: ReturnType<typeof rotulosMapa>;
}) {
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

      <View style={estilos.linha}>
        <Text style={estilos.rotulo}>Plus Code</Text>
        <Text selectable style={estilos.codigo} accessibilityLabel="Plus Code">
          {encode(captura.latitude, captura.longitude)}
        </Text>
      </View>

      <Text style={estilos.rotulo}>Divisão administrativa</Text>
      <Linha nome={rotulos.provincia} valor={local?.provincia ?? '—'} />
      <Linha nome={rotulos.municipio} valor={local?.municipio ?? '—'} />
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
      <Linha nome="Coordenadas" valor={textoCoordenadas(captura.latitude, captura.longitude)} />
      {children}
    </Cartao>
  );
}

const NOMES_TIPO: Record<ResultadoPesquisa['tipo'], string> = { morada: 'Morada', rua: 'Rua', bairro: 'Bairro' };
function nomeTipoPesquisa(tipo: ResultadoPesquisa['tipo'], localidade: string): string { return tipo === 'bairro' ? localidade : NOMES_TIPO[tipo]; }
function rotulosMapa(config: typeof CONFIG_AO_OFFLINE_TESTE) {
  const localidade = nivelLocalidade(config)?.label ?? 'Bairro';
  return {
    localidade,
    provincia: nivelPorChave(config, 'province')?.label ?? 'Província',
    municipio: nivelPorChave(config, 'municipality')?.label ?? 'Município',
  };
}

/** Passo 1: resultados da pesquisa única. */
function ResultadosPesquisa({ resultados, aoEscolher, localidade }: { resultados: ResultadoPesquisa[]; aoEscolher(p: PontoEncontrado): void; localidade: string }) {
  if (resultados.length === 0) return <Caixa tipo="info">Sem resultados.</Caixa>;
  return (
    <View style={estilos.resultados}>
      {resultados.map((r) => {
        const temPonto = r.latitude !== null && r.longitude !== null;
        return (
          <Pressable
            key={`${r.tipo}:${r.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${nomeTipoPesquisa(r.tipo, localidade)}: ${r.titulo}${temPonto ? '. Ver no mapa' : ''}`}
            accessibilityState={{ disabled: !temPonto }}
            disabled={!temPonto}
            onPress={() => temPonto && aoEscolher({ latitude: r.latitude!, longitude: r.longitude!, titulo: r.titulo })}
            style={({ pressed }) => [estilos.resultado, pressed && estilos.resultadoPremido]}
          >
            <Text style={estilos.resultadoTitulo}>{r.titulo}</Text>
            <Text style={estilos.nota}>{[nomeTipoPesquisa(r.tipo, localidade), r.subtitulo].filter(Boolean).join(' · ')}</Text>
            <Text style={estilos.resultadoAcao}>{temPonto ? 'Ver no mapa ›' : 'Ainda sem posição no mapa'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const CENTRO_HUAMBO = { latitude: REGIAO_HUAMBO.centro[1], longitude: REGIAO_HUAMBO.centro[0] };

export default function Mapa() {
  const [configPais, setConfigPais] = useState(CONFIG_AO_OFFLINE_TESTE);
  const [codigoPais, setCodigoPais] = useState(paisAtual());
  useEffect(() => { let ativo = true; void obterConfigPais(codigoPais).then((config) => { if (ativo) setConfigPais(config); }).catch(() => undefined); return () => { ativo = false; }; }, [codigoPais]);
  const rotulos = useMemo(() => rotulosMapa(configPais), [configPais]);
  const router = useRouter();
  const sessao = useSessao();
  const userId = sessao.utilizador?.id ?? null;
  const temMoradas = sessao.acesso.separadores.includes('guardados');
  const online = useOnline();
  const gps = usePosicao();
  const estadoMapa = useMapaOffline(online, codigoPais);

  const aoVivo = gps.estado === 'ok' ? gps.posicao : null;
  // O ponto azul segue o GPS ao vivo; o código usa a posição medida (média de várias leituras).
  const medida = useCapturaGps(aoVivo);
  const captura = medida.captura;
  const posicao = captura ?? aoVivo ?? (gps.estado === 'a_procurar' ? gps.ultima : null);
  // Com mais de ±10 m o código fica provisório (não se pede a confirmação ao servidor).
  const info = useInfoLocal(captura, online, !captura?.fraca);
  const origem = codigoPais === 'AO' ? origemDoMapa(estadoMapa, online) : null;
  const chaveOrigem = origem ? `${origem.tiles}|${origem.fontes}` : null;
  // O estilo só muda quando a origem muda (evita recarregar o mapa a cada posição).
  const estiloBase = useMemo(() => codigoPais === 'AO' ? (origem ? criarEstilo(origem) : null) : (online ? criarEstiloOnlineOSM() : null), [codigoPais, online, chaveOrigem]);
  const estiloSatelite = useMemo(() => criarEstiloSatelite(), []);
  const semPermissao = gps.estado === 'sem_permissao' || gps.estado === 'gps_desligado';

  const [camada, setCamada] = useState<Camada>('mapa');
  const [sateliteAceite, setSateliteAceite] = useState(false);
  const [ecraInteiro, setEcraInteiro] = useState(false);
  const [alvo, setAlvo] = useState<PontoEncontrado | null>(null);
  const [leitorAberto, setLeitorAberto] = useState(false);
  const [lidoQr, setLidoQr] = useState<string | null>(null);
  const [podeRolar, setPodeRolar] = useState(true);
  const [verificacao, setVerificacao] = useState<Verificacao | null>(null);
  const [guardadoEm, setGuardadoEm] = useState<string | null>(null);
  const [historico, setHistorico] = useState<ItemHistoricoLocaliza[]>([]);
  const rolagem = useRef<ScrollView>(null);
  const yMapa = useRef(0);

  useEffect(() => {
    if (!userId || online === null) return;
    let ativo = true;
    // Se nem o telemóvel responder, fica "desconhecido" (como no Registar): o servidor decide.
    servicoRegisto
      .verificacao(userId, online)
      .then((resultado) => {
        if (ativo) setVerificacao(resultado);
      })
      .catch(() => {
        if (ativo) setVerificacao('desconhecido');
      });
    return () => {
      ativo = false;
    };
  }, [userId, online]);

  // Sem rede não há imagens de satélite: volta ao mapa do telemóvel.
  const satelite = camada === 'satelite' && online === true;
  useEffect(() => {
    if (online === false && camada === 'satelite') setCamada('mapa');
  }, [online]);
  const estilo = satelite ? estiloSatelite : estiloBase;

  const mostrarNoMapa = useCallback((p: PontoEncontrado) => {
    setAlvo(p);
    void abrirBaseDados().then((db) => criarRepositorioHistoricoLocaliza(db).registar({ id: p.titulo + ':' + p.latitude.toFixed(5) + ':' + p.longitude.toFixed(5), titulo: p.titulo, latitude: p.latitude, longitude: p.longitude, subtitulo: null })).then(() => abrirBaseDados()).then((db) => criarRepositorioHistoricoLocaliza(db).listar()).then(setHistorico).catch(() => undefined);
    rolagem.current?.scrollTo({ y: Math.max(0, yMapa.current - 16), animated: true });
  }, [rolagem, yMapa]);
  const pesquisa = usePesquisaMapa({
    online,
    referencia: captura ?? aoVivo ?? CENTRO_HUAMBO,
    aoEncontrarPonto: mostrarNoMapa,
  });

  // O site pesquisa automaticamente após 3 caracteres; no mobile usamos debounce para evitar pedidos a cada tecla.
  useEffect(() => {
    const texto = pesquisa.texto.trim();
    if (texto.length < 3) return;
    const timer = setTimeout(() => void pesquisa.procurar(texto), 400);
    return () => clearTimeout(timer);
  }, [pesquisa.texto, pesquisa.procurar]);

  const escolherCamada = (c: Camada) => {
    if (c === 'mapa') return setCamada('mapa');
    if (!online) {
      Alert.alert('Sem rede', 'A vista de Satélite precisa de internet. O mapa normal funciona sem rede.');
      return;
    }
    if (sateliteAceite) return setCamada('satelite');
    Alert.alert(
      'Vista de Satélite',
      'As imagens de satélite vêm da internet e gastam dados móveis (cerca de 1 MB por ecrã). O mapa normal está no telemóvel e não gasta dados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Usar satélite',
          onPress: () => {
            setSateliteAceite(true);
            setCamada('satelite');
          },
        },
      ],
    );
  };

  const obterLocalizacao = () => {
    if (semPermissao) return gps.tentarDeNovo();
    setAlvo(null);
    medida.medirDeNovo();
  };

  const aoLerQr = (conteudo: string) => {
    setLeitorAberto(false);
    setLidoQr(conteudo);
    pesquisa.setTexto(conteudo);
    void pesquisa.procurar(conteudo);
  };

  // Registar e guardar favoritos: só com a verificação simples (o servidor exige-a).
  const verificado = temMoradas && podeRegistar(verificacao);
  const motivoVerificacao =
    verificacao === 'pendente'
      ? 'A tua verificação simples está em revisão. Quando for aprovada, podes registar moradas e guardar favoritos.'
      : 'Para registar moradas e guardar favoritos precisas de fazer a verificação simples (Conta → Verificação).';
  const plusCode = captura ? encode(captura.latitude, captura.longitude) : null;
  const bloqueioFavorito = !userId
    ? 'Entra na tua conta para guardar favoritos.'
    : !verificado
      ? motivoVerificacao
      : !captura
        ? 'Espera que a tua posição seja medida.'
        : captura.fraca
          ? `Espera por uma precisão melhor que ±${medida.limite} m.`
          : null;

  const guardarFavorito = async (escolhas: { visibilidade: Visibilidade; categoria: CategoriaFavorito }) => {
    if (!userId || !captura || !plusCode) throw new Error('Espera que a tua posição seja medida.');
    const cp = info?.codigoPostal;
    await servicoMoradas.guardarDoMapa(
      userId,
      {
        latitude: captura.latitude,
        longitude: captura.longitude,
        precisao: captura.precisao,
        plusCode,
        codigoPostal: cp?.estado === 'confirmado' ? cp.codigo : null,
        provincia: info?.local.provincia ?? null,
        municipio: info?.local.municipio ?? null,
      },
      escolhas,
    );
    setGuardadoEm(plusCode);
    mudancasMoradas.avisar();
    let enviado = false;
    if (online) {
      const r = await servicoMoradas.enviarPendentes(userId).catch(() => null);
      enviado = !!r && r.erro === null;
      mudancasMoradas.avisar();
    }
    return enviado
      ? 'Guardado! Já aparece nas tuas Moradas (por validar).'
      : 'Guardado no telemóvel. Vai para o servidor quando houver rede.';
  };

  const mapa = (altura: number | 'cheio', botaoCanto: { titulo: string; aoCarregar(): void }) => (
    <VistaMapa
      estilo={estilo}
      camada={satelite ? 'satelite' : 'mapa'}
      aoEscolherCamada={escolherCamada}
      online={online}
      posicao={posicao}
      semPermissao={semPermissao}
      alvo={alvo}
      altura={altura}
      aoTocar={(t) => setPodeRolar(!t)}
      botaoCanto={botaoCanto}
    />
  );

  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <ScrollView
        ref={rolagem}
        scrollEnabled={podeRolar}
        style={estilos.ecra}
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Pesquisa única */}
        <Campo
          rotulo="Pesquisar"
          placeholder="Pesquisar código, Plus Code, rua, bairro..."
          value={pesquisa.texto}
          onChangeText={pesquisa.setTexto}
          onSubmitEditing={() => void pesquisa.procurar()}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={200}
        />
        {pesquisa.estado.erro ? <Caixa tipo="erro">{pesquisa.estado.erro}</Caixa> : null}
        {pesquisa.estado.link ? (
          <Caixa tipo="info">
            <Text style={estilos.textoCaixa}>{`Este QR Code tem um link: ${pesquisa.estado.link}`}</Text>
            <Botao titulo="Abrir o link" variante="secundario" onPress={() => void Linking.openURL(pesquisa.estado.link!)} />
          </Caixa>
        ) : null}
        {pesquisa.estado.resultados ? <ResultadosPesquisa resultados={pesquisa.estado.resultados} aoEscolher={mostrarNoMapa} localidade={rotulos.localidade} /> : null}
        {historico.length > 0 ? (
          <Cartao>
            <View style={estilos.linhaAlvo}>
              <Subtitulo>Histórico recente</Subtitulo>
              <Botao titulo="Limpar" variante="secundario" onPress={() => { void abrirBaseDados().then((db) => criarRepositorioHistoricoLocaliza(db).limpar()).then(() => setHistorico([])); }} />
            </View>
            {historico.map((item) => <Pressable key={item.id} onPress={() => mostrarNoMapa({ latitude: item.latitude, longitude: item.longitude, titulo: item.titulo })} style={estilos.resultado} accessibilityRole="button"><Text style={estilos.resultadoTitulo}>{item.titulo}</Text><Text style={estilos.nota}>{item.latitude.toFixed(5) + ', ' + item.longitude.toFixed(5)}</Text></Pressable>)}
          </Cartao>
        ) : null}

        {/* 2. Obter localização + Ler QR */}
        <View style={estilos.linhaBotoes}>
          <View style={estilos.botaoGrande}>
            <Botao
              titulo={captura ? 'Atualizar localização' : 'Obter localização'}
              onPress={obterLocalizacao}
              aCarregar={!semPermissao && medida.aMedir}
            />
          </View>
          <View style={estilos.botaoPequeno}>
            <Botao titulo="Ler QR" variante="secundario" onPress={() => setLeitorAberto(true)} />
          </View>
        </View>
        {leitorAberto ? <LeitorQr aoLer={aoLerQr} aoFechar={() => setLeitorAberto(false)} /> : null}
        {lidoQr ? <Text style={estilos.nota}>{`Lido: ${lidoQr}`}</Text> : null}

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

        {/* 3, 4 e 5. Resultados, QR Code e Registar */}
        {!semPermissao ? (
          <CartaoOndeEstou medida={medida} comSinal={aoVivo !== null} info={info} online={online} rotulos={rotulos}>
            {captura && plusCode ? (
              <>
                <QrLocal
                  latitude={captura.latitude}
                  longitude={captura.longitude}
                  plusCode={plusCode}
                  codigoPostal={info?.codigoPostal.codigo ?? null}
                />
                {verificado ? (
                  <Botao titulo="Registar esta casa, loja, escola..." onPress={() => router.push('/guardados/registar')} />
                ) : (
                  <Caixa tipo="info">
                    <Text style={estilos.textoCaixa}>{motivoVerificacao}</Text>
                    {verificacao !== 'pendente' ? (
                      <Botao titulo="Fazer a verificação" variante="secundario" onPress={() => router.push('/definicoes/verificacao')} />
                    ) : null}
                  </Caixa>
                )}
              </>
            ) : null}
          </CartaoOndeEstou>
        ) : null}

        {/* 6. Mapa (com Mapa/Satélite) */}
        <View onLayout={(e) => (yMapa.current = e.nativeEvent.layout.y)}>
          {mapa(340, { titulo: 'Ecrã inteiro', aoCarregar: () => setEcraInteiro(true) })}
        </View>
        {alvo ? (
          <View style={estilos.linhaAlvo}>
            <Text style={[estilos.nota, estilos.flex]}>{`No mapa: ${alvo.titulo}`}</Text>
            <Botao titulo="Navegar" variante="secundario" onPress={() => {
              void Linking.openURL("https://www.google.com/maps/dir/?api=1&destination=" + alvo.latitude + "," + alvo.longitude);
            }} />
            <Botao titulo="Partilhar" variante="secundario" onPress={() => {
              void Share.share({ message: alvo.titulo + "\nhttps://www.google.com/maps/search/?api=1&query=" + alvo.latitude + "," + alvo.longitude });
            }} />
            <Botao titulo="Tirar do mapa" variante="secundario" onPress={() => setAlvo(null)} />
          </View>
        ) : null}
        {posicao && !dentroDaRegiao(REGIAO_HUAMBO, posicao.latitude, posicao.longitude) ? (
          <Caixa tipo="info">{`Estás fora da zona do mapa (${REGIAO_HUAMBO.nome}). O teu código continua a funcionar.`}</Caixa>
        ) : null}

        {/* 7. Privacidade, Categoria e Guardar como favorito */}
        <Cartao>
          <Subtitulo>Guardar este local</Subtitulo>
          <GuardarFavorito bloqueio={bloqueioFavorito} guardado={!!plusCode && guardadoEm === plusCode} aoGuardar={guardarFavorito} />
        </Cartao>

        {/* 8. Mapa para usar sem rede */}
        <CartaoMapaOffline estado={estadoMapa} online={online} />
      </ScrollView>

      <Modal visible={ecraInteiro} animationType="slide" onRequestClose={() => setEcraInteiro(false)}>
        <SafeAreaView style={estilos.ecra} edges={['top', 'bottom', 'left', 'right']}>
          {mapa('cheio', { titulo: 'Fechar', aoCarregar: () => setEcraInteiro(false) })}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: 16, gap: 12, paddingBottom: 32 },
  flex: { flex: 1 },
  linhaBotoes: { flexDirection: 'row', gap: 8 },
  botaoGrande: { flex: 3 },
  botaoPequeno: { flex: 2 },
  linhaAlvo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultados: { gap: 8 },
  resultado: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: 12,
    padding: 12,
    minHeight: 56,
    gap: 2,
    backgroundColor: CORES.fundo,
  },
  resultadoPremido: { backgroundColor: CORES.fundoSuave },
  resultadoTitulo: { fontSize: TAMANHOS.texto, fontWeight: '700', color: CORES.texto },
  resultadoAcao: { fontSize: 15, fontWeight: '700', color: CORES.primaria },
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