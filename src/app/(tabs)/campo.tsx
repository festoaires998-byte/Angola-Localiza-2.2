import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Botao, Caixa, Campo as CampoInput, Ecra, EcraCarregamento, Subtitulo, Texto } from '@/components/ui';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useCapturaGps } from '@/hooks/useCapturaGps';
import { useOnline } from '@/hooks/useOnline';
import { usePosicao } from '@/hooks/usePosicao';
import { useSessao } from '@/hooks/useSessao';
import { geocodificarInverso } from '@/api/geocode';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import {
  contarCampoHoje,
  enviarCampo,
  enviarFotoCampo,
  listarContextoCampo,
  listarNumerosRua,
  listarReverificacoesCampo,
  verificarDuplicadoCampo,
  type ContextoCampo,
  type ReverificacaoCampo,
} from '@/services/campo/campoApp';
import { mapaHuambo } from '@/services/mapas/mapaOffline';

type Opcao = { value: string; label: string };

function Seletor({ label, value, placeholder, options, onChange }: {
  label: string; value: string; placeholder: string; options: Opcao[]; onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = options.find((o) => o.value === value);
  return (
    <View style={estilos.seletorWrap}>
      <Text style={estilos.rotulo}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => setAberto(true)} style={estilos.seletor}>
        <Text style={[estilos.seletorTexto, !atual && estilos.placeholder]}>{atual?.label ?? placeholder}</Text>
        <Text style={estilos.seta}>⌄</Text>
      </Pressable>
      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={estilos.modalFundo} onPress={() => setAberto(false)}>
          <Pressable style={estilos.menu} onPress={(e) => e.stopPropagation()}>
            <Text style={estilos.menuTitulo}>{label}</Text>
            {options.map((o) => (
              <Pressable key={o.value} onPress={() => { onChange(o.value); setAberto(false); }} style={[estilos.opcao, o.value === value && estilos.opcaoAtiva]}>
                <Text style={estilos.opcaoTexto}>{o.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function Campo() {
  const router = useRouter();
  const online = useOnline();
  const sessao = useSessao();
  const gps = usePosicao();
  const posicao = gps.estado === 'ok' ? gps.posicao : gps.estado === 'a_procurar' ? gps.ultima : null;
  const capturaGps = useCapturaGps(posicao ? { latitude: posicao.latitude, longitude: posicao.longitude, precisao: posicao.precisao, hora: posicao.hora } : null);
  const info = useInfoLocal(posicao ? { latitude: posicao.latitude, longitude: posicao.longitude } : null, online === true, posicao?.precisao != null && posicao.precisao <= 10);

  const [contexto, setContexto] = useState<ContextoCampo | null>(null);
  const [provincia, setProvincia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [referencia, setReferencia] = useState('');
  const [bairro, setBairro] = useState('');
  const [rua, setRua] = useState('');
  const [ruaNomeNova, setRuaNomeNova] = useState('');
  const [bairroNomeNovo, setBairroNomeNovo] = useState('');
  const [portaIntercalada, setPortaIntercalada] = useState(false);
  const [numeroBase, setNumeroBase] = useState('');
  const [numerosRua, setNumerosRua] = useState<number[]>([]);
  const [duplicado, setDuplicado] = useState<{ found: boolean; distance_meters?: number; postal_code?: string | null } | null>(null);
  const [duplicadoJustificacao, setDuplicadoJustificacao] = useState('');
  const [duplicadoDecidido, setDuplicadoDecidido] = useState(false);
  const [precisaoJustificacao, setPrecisaoJustificacao] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [codigoPrevisto, setCodigoPrevisto] = useState('');
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const [reverificacoes, setReverificacoes] = useState<ReverificacaoCampo[]>([]);
  const [mapaMsg, setMapaMsg] = useState('');
  const [mapaADescarregar, setMapaADescarregar] = useState(false);

  const posicaoAtual = posicao;
  const posicaoSegura = capturaGps.captura;
  const nomePais = sessao.utilizador?.countryCode ?? 'AO';
  const referenciaAutomatica = info?.codigoPostal?.codigo ?? info?.plusCode ?? '';

  useEffect(() => {
    if (!online || !posicaoAtual) return;
    let ativo = true;
    listarContextoCampo(posicaoAtual.latitude, posicaoAtual.longitude).then((v) => ativo && setContexto(v)).catch(() => ativo && setContexto(null));
    geocodificarInverso(posicaoAtual.latitude, posicaoAtual.longitude).then((v) => {
      if (!ativo) return;
      setProvincia(v.provincia ?? '');
      setMunicipio(v.municipio ?? '');
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, [online, posicaoAtual?.latitude, posicaoAtual?.longitude]);

  useEffect(() => {
    if (!posicaoSegura || !online) return;
    let ativo = true;
    setDuplicado(null);
    verificarDuplicadoCampo(posicaoSegura.latitude, posicaoSegura.longitude).then((v) => ativo && setDuplicado(v)).catch(() => undefined);
    return () => { ativo = false; };
  }, [online, posicaoSegura?.latitude, posicaoSegura?.longitude]);

  useEffect(() => {
    if (!contexto || !rua || rua.startsWith('__')) return;
    const s = contexto.streets.find((x) => x.id === rua);
    if (!s || !portaIntercalada) { setNumerosRua([]); return; }
    listarNumerosRua(s.id).then((r) => setNumerosRua(r.house_numbers ?? [])).catch(() => setNumerosRua([]));
  }, [contexto, rua, portaIntercalada]);

  useEffect(() => {
    if (!sessao.utilizador || online !== true) return;
    void contarCampoHoje().then((r) => setDailyCount(r.count)).catch(() => undefined);
    void listarReverificacoesCampo().then((r) => setReverificacoes(r.flagged ?? [])).catch(() => setReverificacoes([]));
  }, [sessao.utilizador?.id, online]);

  useEffect(() => {
    setCodigoPrevisto(referenciaAutomatica);
  }, [referenciaAutomatica]);

  if (!sessao.carregado || gps.estado === 'a_procurar') return <EcraCarregamento texto="A preparar o Campo…" />;
  if (!sessao.utilizador) return <Ecra><Caixa tipo="aviso">Inicia sessão para utilizar o modo Campo.</Caixa></Ecra>;
  if (online === false) return <Ecra><Caixa tipo="aviso">O modo Campo precisa de ligação à internet para sincronizar a recolha com segurança.</Caixa></Ecra>;
  if (!posicaoAtual) return <Ecra><Caixa tipo="aviso">Autoriza a localização e fica ao ar livre alguns segundos para obter uma posição.</Caixa></Ecra>;

  async function tirarFoto() {
    setErro(null);
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) { setErro('Autoriza a câmara para fotografar a fachada.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]?.uri) setFoto(r.assets[0].uri);
  }

  async function prepararMapaOffline() {
    setMapaADescarregar(true); setMapaMsg('A preparar o mapa desta região…');
    try {
      await mapaHuambo.verificarRemoto();
      await mapaHuambo.descarregar();
      setMapaMsg('✅ Mapa offline preparado neste telemóvel.');
    } catch (e) { setMapaMsg(e instanceof Error ? e.message : 'Não foi possível descarregar o mapa.'); }
    finally { setMapaADescarregar(false); }
  }

  function selecionarRua(v: string) { setRua(v); setRuaNomeNova(''); }

  function selecionarBairro(v: string) { setBairro(v); setBairroNomeNovo(''); }

  async function enviar() {
    setErro(null); setResultado(null);
    if (!posicaoSegura) return setErro('Aguarda a captura de 3 leituras GPS boas antes de submeter.');
    if (!foto) return setErro('A fotografia da fachada é obrigatória.');
    if (!referencia.trim()) return setErro('Indica uma referência que permita identificar o local.');
    if (!rua) return setErro('Escolhe a rua ou uma opção de rua sem nome.');
    if (portaIntercalada && !numeroBase) return setErro('Escolhe entre qual número a porta fica intercalada.');
    if (!bairro) return setErro('Escolhe o bairro ou uma opção de bairro sem nome.');
    if (duplicado?.found && !duplicadoDecidido) return setErro('Há uma morada próxima. Escolhe “Vincular e completar existente” ou confirma que é um ponto diferente.');
    if (posicaoSegura.precisao > 15 && precisaoJustificacao.trim().length < 10) return setErro('A precisão do GPS é baixa. Explica em pelo menos 10 caracteres porque continuas.');
    if (duplicado?.found && duplicadoJustificacao.trim().length > 0 && duplicadoJustificacao.trim().length < 10) return setErro('A justificação do ponto diferente deve ter pelo menos 10 caracteres.');
    setAEnviar(true);
    try {
      const marca = await fotoComMarcaDeAgua(foto, [
        '📍 ' + posicaoSegura.latitude.toFixed(6) + ', ' + posicaoSegura.longitude.toFixed(6) + ' · ' + nomePais,
        '📮 ' + (info?.codigoPostal?.codigo ?? info?.plusCode ?? 'sem código'),
      ], 'campo');
      const nome = sessao.utilizador.id + '/' + marca.sha256 + '.jpg';
      const url = await enviarFotoCampo(marca.uri, nome);

      const streetChoice = rua === '__new_named__' ? { streetName: ruaNomeNova } : rua === '__new_unnamed__' ? { newUnnamedStreet: true } : { streetId: rua };
      const bairroChoice = bairro === '__new_named__' ? bairroNomeNovo : bairro === '__new_unnamed__' ? undefined : bairro.trim();

      const r = await enviarCampo({
        latitude: posicaoSegura.latitude,
        longitude: posicaoSegura.longitude,
        accuracyMeters: posicaoSegura.precisao,
        accuracyJustification: precisaoJustificacao || undefined,
        photoFacadeUrl: url,
        ...(streetChoice.streetId ? { streetId: streetChoice.streetId } : {}),
        ...(streetChoice.streetName ? { streetName: streetChoice.streetName } : {}),
        newUnnamedStreet: streetChoice.newUnnamedStreet,
        neighborhoodName: bairroChoice,
        reference: referencia,
        placeKind: undefined,
        watermarkMatch: true,
        overrideDuplicate: !!duplicadoJustificacao.trim() && duplicadoDecidido,
        duplicateJustification: duplicadoJustificacao.trim() || undefined,
        infillBaseHouseNumber: portaIntercalada ? Number(numeroBase) : null,
      });
      setCodigoPrevisto(referenciaAutomatica || '-');
      setResultado('Levantamento guardado como ' + r.status + '. Código previsto: ' + (referenciaAutomatica || '-'));
      setDailyCount((v) => v == null ? v : v + 1);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setAEnviar(false); }
  }

  function proximaPorta() {
    setResultado(null); setErro(null); setFoto(null); setReferencia(''); setRua(''); setBairro('');
    setRuaNomeNova(''); setBairroNomeNovo(''); setPortaIntercalada(false); setNumeroBase('');
    setDuplicado(null); setDuplicadoJustificacao(''); setDuplicadoDecidido(false); setPrecisaoJustificacao('');
    setCodigoPrevisto(''); setContexto(null);
    // O hook mantém a última posição, por isso pede explicitamente uma nova medição.
    capturaGps.medirDeNovo();
  }

  const streetOptions: Opcao[] = [
    ...(contexto?.streets ?? []).map((s) => ({ value: s.id, label: s.name + ' (próx. nº ' + s.next_seq + ')' })),
    { value: '__new_named__', label: '+ Nova rua (com nome)' },
    { value: '__new_unnamed__', label: '+ Nova rua sem nome (Rua S/Nº)' },
  ];
  const bairroOptions: Opcao[] = [
    ...(contexto?.neighborhoods_nearby ?? []).map((n) => ({ value: n, label: n })),
    { value: '__new_named__', label: '+ Novo bairro (com nome)' },
    { value: '__new_unnamed__', label: '+ Novo bairro (sem nome)' },
  ];
  const numeroOptions: Opcao[] = numerosRua.map((n) => ({ value: String(n), label: 'nº ' + n }));

  return (
    <Ecra>
      <View style={estilos.cabecalhoLinha}>
        <Subtitulo>Campo · {nomePais}</Subtitulo>
        <Text style={estilos.contador}>{dailyCount == null ? '-- hoje' : dailyCount + ' hoje'}</Text>
      </View>

      <Botao titulo="💬 Falar com o supervisor" variante="secundario" onPress={() => router.push({ pathname: '/chat-organizacao', params: { tipo: 'ORG_CAMPO' } })} />

      {reverificacoes.length > 0 ? (
        <Caixa tipo="aviso">
          <Text style={estilos.negrito}>⚠️ Reverificar (moradas com entrega falhada) · {reverificacoes.length}</Text>
          {reverificacoes.slice(0, 5).map((x) => (
            <Text key={x.id} style={estilos.listaItem}>{x.postal_code || x.plus_code || 'sem código'} · {x.reason}{'\n'}{x.reference || ''}</Text>
          ))}
          <Text style={estilos.textoSuave}>Vai ao local e captura novamente; o sistema deteta a proximidade.</Text>
        </Caixa>
      ) : null}

      <Botao titulo={mapaADescarregar ? 'A preparar mapa…' : '📥 Preparar esta zona para trabalhar offline'} onPress={() => void prepararMapaOffline()} desativado={mapaADescarregar} aCarregar={mapaADescarregar} />
      {mapaMsg ? <Caixa tipo="info">{mapaMsg}</Caixa> : null}
      <Texto suave>As moradas e o mapa regional podem ser preparados no telemóvel para utilização offline.</Texto>

      <Botao titulo={capturaGps.aMedir ? `📍 Capturar GPS (${capturaGps.leiturasBoas} de ${capturaGps.necessarias})` : '📍 GPS capturado · Medir novamente'} onPress={() => capturaGps.medirDeNovo()} desativado={capturaGps.aMedir && !capturaGps.captura} />
      <Caixa tipo="info">
        {'Posição: ' + (posicaoSegura ? posicaoSegura.latitude.toFixed(6) + ', ' + posicaoSegura.longitude.toFixed(6) : posicaoAtual.latitude.toFixed(6) + ', ' + posicaoAtual.longitude.toFixed(6)) +
        '\nPrecisão: ' + (posicaoSegura ? Math.round(posicaoSegura.precisao) + ' m · ' + posicaoSegura.leituras + ' leituras' : 'a medir…') +
        '\nPlus Code: ' + (info?.plusCode || 'a calcular') +
        '\nProvíncia: ' + (provincia || 'a identificar…') +
        '\nMunicípio: ' + (municipio || 'a identificar…') +
        '\nQuadra: ' + (contexto ? contexto.quadra_code + ' · ' + contexto.kind + ' · ≈' + Math.round(contexto.area_m2) + ' m²' : 'a calcular…') +
        '\nCódigo previsto: ' + (codigoPrevisto || 'a calcular…')}
      </Caixa>

      {duplicado?.found ? (
        <Caixa tipo="erro">
          <Text style={estilos.negrito}>⚠️ Já existe uma morada perto</Text>
          <Text>A {Math.round(duplicado.distance_meters ?? 0)} m: {duplicado.postal_code || '(sem código)'}</Text>
          <Botao titulo="Vincular e completar existente" variante="secundario" onPress={() => { setDuplicadoDecidido(true); setDuplicadoJustificacao(''); }} />
          <Botao titulo="É um ponto diferente" variante="secundario" onPress={() => setDuplicadoDecidido(true)} />
          {duplicadoDecidido && !duplicadoJustificacao.trim() ? <CampoInput rotulo="Justificação do ponto diferente (mín. 10 caracteres)" value={duplicadoJustificacao} onChangeText={setDuplicadoJustificacao} placeholder="Explica porque é fisicamente diferente." multiline /> : null}
        </Caixa>
      ) : null}

      <Botao titulo={foto ? 'Refazer fotografia da fachada' : '📷 Fotografar fachada'} onPress={() => void tirarFoto()} />
      {foto ? <Image source={{ uri: foto }} style={estilos.foto} /> : null}
      {foto ? <Caixa tipo="info">Fotografia preparada; será marcada com posição, país e código antes do envio.</Caixa> : null}

      <CampoInput rotulo="Referência do local" value={referencia} onChangeText={setReferencia} placeholder="Ponto de referência" multiline />
      <Seletor label="Rua *" value={rua} placeholder={contexto ? 'Escolhe uma rua…' : 'Captura o GPS primeiro…'} options={streetOptions} onChange={selecionarRua} />
      {rua === '__new_named__' ? <CampoInput rotulo="Nome da nova rua" value={ruaNomeNova} onChangeText={setRuaNomeNova} placeholder="Nome da nova rua" /> : null}
      <Pressable onPress={() => setPortaIntercalada((v) => !v)} style={estilos.checkboxLinha}>
        <View style={[estilos.checkbox, portaIntercalada && estilos.checkboxAtivo]}>{portaIntercalada ? <Text style={estilos.check}>✓</Text> : null}</View>
        <Text style={estilos.checkboxTexto}>Porta intercalada (entre duas já existentes)</Text>
      </Pressable>
      {portaIntercalada && rua && !rua.startsWith('__') ? <Seletor label="Entre qual número?" value={numeroBase} placeholder="Escolhe o número base…" options={numeroOptions} onChange={setNumeroBase} /> : null}
      <Seletor label="Bairro *" value={bairro} placeholder={contexto ? 'Escolhe um bairro…' : 'Captura o GPS primeiro…'} options={bairroOptions} onChange={selecionarBairro} />
      {bairro === '__new_named__' ? <CampoInput rotulo="Nome do novo bairro" value={bairroNomeNovo} onChangeText={setBairroNomeNovo} placeholder="Nome do novo bairro" /> : null}
      {posicaoSegura && posicaoSegura.precisao > 15 ? <CampoInput rotulo="Justificação da precisão GPS" value={precisaoJustificacao} onChangeText={setPrecisaoJustificacao} placeholder="Explica porque a recolha continua." multiline /> : null}

      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {resultado ? (
        <Caixa tipo="sucesso">
          <Text style={estilos.negrito}>✅ Levantamento guardado como PROPOSTO</Text>
          <Text>Código previsto: {codigoPrevisto || '-'}</Text>
          <Text>Estado: PROPOSTA / {resultado}</Text>
          <Text style={estilos.textoSuave}>Aguarda aprovação no separador Validar.</Text>
          <Botao titulo="➡️ Próxima porta" onPress={proximaPorta} />
        </Caixa>
      ) : null}

      <Botao titulo="Submeter recolha de Campo" onPress={() => void enviar()} desativado={aEnviar} aCarregar={aEnviar} />
      <Texto suave>O servidor verifica identidade, dispositivo, duplicados, quadra, rua e regras de qualidade antes de aceitar a recolha.</Texto>
    </Ecra>
  );
}

const estilos = StyleSheet.create({
  cabecalhoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contador: { color: '#666', fontSize: 13 },
  rotulo: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 6 },
  seletorWrap: { gap: 6 },
  seletor: { minHeight: 52, borderWidth: 1, borderColor: '#aaa', borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f4ead4' },
  seletorTexto: { color: '#222', fontSize: 15, flex: 1 },
  placeholder: { color: '#777' },
  seta: { fontSize: 22, color: '#555' },
  modalFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  menu: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '75%' },
  menuTitulo: { fontSize: 18, fontWeight: '800', color: '#222', marginBottom: 8 },
  opcao: { paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  opcaoAtiva: { backgroundColor: '#e8f1fb' },
  opcaoTexto: { fontSize: 16, color: '#222' },
  negrito: { fontWeight: '800', color: '#222' },
  listaItem: { marginTop: 5, color: '#333', fontSize: 12 },
  textoSuave: { color: '#777', marginTop: 5, fontSize: 12 },
  checkboxLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: '#888', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  checkboxAtivo: { backgroundColor: '#1f6feb', borderColor: '#1f6feb' },
  check: { color: '#fff', fontWeight: '900' },
  checkboxTexto: { flex: 1, color: '#333' },
  foto: { width: '100%', height: 220, borderRadius: 12, marginVertical: 8 },
});
