import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';

import { Botao, Caixa, Campo as CampoInput, Ecra, EcraCarregamento, Subtitulo, Texto } from '@/components/ui';
import { CampoCodigo } from '@/components/CampoCodigo';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useOnline } from '@/hooks/useOnline';
import { usePosicao } from '@/hooks/usePosicao';
import { useSessao } from '@/hooks/useSessao';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import { enviarCampo, enviarFotoCampo, listarContextoCampo, type ContextoCampo } from '@/services/campo/campoApp';

export default function Campo() {
  const online = useOnline();
  const sessao = useSessao();
  const gps = usePosicao();
  const posicao = gps.estado === 'ok' ? gps.posicao : gps.estado === 'a_procurar' ? gps.ultima : null;
  const info = useInfoLocal(posicao ? { latitude: posicaoAtual.latitude, longitude: posicaoAtual.longitude } : null, online === true, posicao?.precisao != null && posicaoAtual.precisao <= 10);
  const [contexto, setContexto] = useState<ContextoCampo | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [referencia, setReferencia] = useState('');
  const [bairro, setBairro] = useState('');
  const [rua, setRua] = useState('');
  const [ruaNova, setRuaNova] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [precisaoJustificacao, setPrecisaoJustificacao] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    if (!online || !posicao) return;
    let ativo = true;
    listarContextoCampo(posicaoAtual.latitude, posicaoAtual.longitude).then((v) => ativo && setContexto(v)).catch(() => ativo && setContexto(null));
    return () => { ativo = false; };
  }, [online, posicao?.latitude, posicao?.longitude]);

  const utilizador = sessao.utilizador;
  const nomePais = utilizador?.countryCode ?? 'AO';
  const referenciaAutomatica = useMemo(() => info?.codigoPostal?.codigo ?? info?.plusCode ?? '', [info?.codigoPostal?.codigo, info?.plusCode]);

  if (!sessao.carregado || gps.estado === 'a_procurar') return <EcraCarregamento texto="A preparar o Campo…" />;
  if (!sessao.utilizador) return <Ecra><Caixa tipo="aviso">Inicia sessão para utilizar o modo Campo.</Caixa></Ecra>;
  if (online === false) return <Ecra><Caixa tipo="aviso">O modo Campo precisa de ligação à internet para sincronizar a recolha com segurança.</Caixa></Ecra>;
  if (!posicao) return <Ecra><Caixa tipo="aviso">Autoriza a localização e fica ao ar livre alguns segundos para obter uma posição.</Caixa></Ecra>;
  const posicaoAtual = posicao;

  async function tirarFoto() {
    setErro(null);
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) { setErro('Autoriza a câmara para fotografar a fachada.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]?.uri) setFoto(r.assets[0].uri);
  }

  async function enviar() {
    setErro(null); setResultado(null);
    if (!foto) { setErro('A fotografia da fachada é obrigatória.'); return; }
    if (!referencia.trim()) { setErro('Indica uma referência que permita identificar o local.'); return; }
    if (!ruaNova && !rua.trim() && !contexto?.streets.length) { setErro('Indica a rua ou marca “Rua sem nome”.'); return; }
    if (posicaoAtual.precisao != null && posicaoAtual.precisao > 15 && precisaoJustificacao.trim().length < 10) { setErro('A precisão do GPS é baixa. Explica em pelo menos 10 caracteres porque continuas.'); return; }
    setAEnviar(true);
    try {
      const marca = await fotoComMarcaDeAgua(foto, ['📍 ' + posicaoAtual.latitude.toFixed(6) + ', ' + posicaoAtual.longitude.toFixed(6) + ' · ' + nomePais, '📮 ' + (info?.codigoPostal?.codigo ?? info?.plusCode ?? 'sem código')], 'campo');
      const nome = utilizador!.id + '/' + marca.sha256 + '.jpg';
      const url = await enviarFotoCampo(marca.uri, nome);
      const r = await enviarCampo({ latitude: posicaoAtual.latitude, longitude: posicaoAtual.longitude, accuracyMeters: posicaoAtual.precisao, accuracyJustification: precisaoJustificacao || undefined, photoFacadeUrl: url, streetName: ruaNova ? undefined : (rua.trim() || contexto?.streets[0]?.name), newUnnamedStreet: ruaNova, neighborhoodName: bairro.trim() || undefined, reference: referencia, placeKind: codigo || undefined, watermarkMatch: true });
      setResultado('Registo ' + r.field_record_id + ' recebido: ' + r.status + '.');
      setFoto(null); setReferencia(''); setPrecisaoJustificacao('');
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setAEnviar(false); }
  }

  return (
    <Ecra>
      <Subtitulo>Campo · {nomePais}</Subtitulo>
      <Caixa tipo="info">{'Posição: ' + posicaoAtual.latitude.toFixed(6) + ', ' + posicaoAtual.longitude.toFixed(6) + '\nPrecisão: ' + (posicaoAtual.precisao == null ? 'desconhecida' : Math.round(posicaoAtual.precisao) + ' m') + '\nCódigo: ' + (referenciaAutomatica || 'a calcular…')}</Caixa>
      <Botao titulo={foto ? 'Refazer fotografia da fachada' : 'Fotografar fachada'} onPress={() => void tirarFoto()} />
      {foto ? <Caixa tipo="info">Fotografia preparada e será marcada com posição, país e código.</Caixa> : null}
      <CampoInput rotulo="Referência do local" value={referencia} onChangeText={setReferencia} placeholder="Ex.: casa azul ao lado da escola" multiline />
      <CampoInput rotulo="Bairro" value={bairro} onChangeText={setBairro} placeholder={contexto?.neighborhoods_nearby?.[0] ?? 'Nome do bairro'} />
      <Campo rotulo="Rua" value={rua} onChangeText={setRua} placeholder={contexto?.streets?.[0]?.name ?? 'Nome da rua'} />
      {contexto?.streets?.length ? <Caixa tipo="info">{'Ruas próximas: ' + contexto.streets.slice(0, 5).map((s) => s.name).join(', ')}</Caixa> : null}
      <Botao titulo={ruaNova ? 'Usar rua sem nome: SIM' : 'Usar rua sem nome: NÃO'} variante="secundario" onPress={() => setRuaNova((v) => !v)} />
      {posicaoAtual.precisao != null && posicaoAtual.precisao > 15 ? <Campo rotulo="Justificação da precisão GPS" value={precisaoJustificacao} onChangeText={setPrecisaoJustificacao} placeholder="Explica porque a recolha continua." multiline /> : null}
      <CampoCodigo valor={codigo} aoMudar={setCodigo} />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {resultado ? <Caixa tipo="sucesso">{resultado}</Caixa> : null}
      <Botao titulo="Submeter recolha de Campo" onPress={() => void enviar()} desativado={aEnviar} aCarregar={aEnviar} />
      <Texto suave>O servidor verifica identidade, dispositivo, duplicados, quadra, rua e regras de qualidade antes de aceitar a recolha.</Texto>
    </Ecra>
  );
}