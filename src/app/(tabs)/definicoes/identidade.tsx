import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';

import { Botao, CabecalhoCartao, Caixa, Campo, Cartao, Ecra, EcraCarregamento, Marcar, Texto, Titulo } from '@/components/ui';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import {
  VIDEO_MAX_S,
  VIDEO_MIN_S,
  duracaoVideoValida,
  enviarFicheiroKyc,
  kycPessoal,
  numeroBiValido,
  situacaoKyc,
  tipoVideo,
  type EstadoKycPessoal,
} from '@/services/identidade/kycPessoal';

type Foto = 'frente' | 'verso';

/**
 * Verificação de identidade do pessoal (técnico de campo, estafeta, supervisor…).
 * Até ser aprovada, só o Mapa e a Conta ficam disponíveis.
 */
export default function IdentidadePessoal() {
  const online = useOnline();
  const { utilizador } = useSessao();
  const [estado, setEstado] = useState<EstadoKycPessoal | null>(null);
  const [consentiu, setConsentiu] = useState(false);
  const [numero, setNumero] = useState('');
  const [fotos, setFotos] = useState<Partial<Record<Foto, string>>>({});
  const [desafios, setDesafios] = useState<string[] | null>(null);
  const [video, setVideo] = useState<{ caminho: string; segundos: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ler = useCallback(async () => {
    if (online === false) return;
    try { setEstado(await kycPessoal.estado()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ler o estado.'); }
  }, [online]);
  useEffect(() => { void ler(); }, [ler]);

  if (!utilizador) return <EcraCarregamento texto="A abrir…" />;
  const userId = utilizador.id;

  if (online === false) {
    return <Ecra><Titulo>Verificação de identidade</Titulo><Caixa tipo="aviso">Sem rede. A verificação de identidade precisa de internet (as fotos e o vídeo vão para revisão).</Caixa></Ecra>;
  }
  if (!estado) return <EcraCarregamento texto="A ler o estado…" />;

  const situacao = situacaoKyc(estado);
  if (situacao.tipo === 'verificado') return <Ecra><Titulo>Verificação de identidade</Titulo><Caixa tipo="sucesso">✅ Identidade verificada.</Caixa></Ecra>;
  if (situacao.tipo === 'em_revisao') {
    return <Ecra><Titulo>Verificação de identidade</Titulo>
      <Caixa tipo="info">{`⏳ Em revisão — enviado há ${situacao.horas} h (normalmente até 24 h). Protocolo #${situacao.protocolo}.`}</Caixa>
      <Botao titulo="Atualizar estado" variante="secundario" onPress={() => void ler()} />
    </Ecra>;
  }
  if (situacao.tipo === 'bloqueado') {
    return <Ecra><Titulo>Verificação de identidade</Titulo>
      <Caixa tipo="erro">{`Reenvios esgotados. Aguarda até ${new Date(situacao.ate).toLocaleDateString('pt-PT')} ou pede revisão ao Admin Nacional.`}</Caixa>
    </Ecra>;
  }

  async function fotografar(qual: Foto) {
    setErro(null); setOk(null);
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setErro('Autoriza a câmara para fotografar o BI.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]?.uri) return;
    setOcupado(true);
    try {
      const caminho = await enviarFicheiroKyc(userId, r.assets[0].uri, `bi-${qual}-${Date.now()}.jpg`, 'image/jpeg');
      setFotos((f) => ({ ...f, [qual]: caminho }));
      setOk(qual === 'frente' ? 'Frente do BI enviada.' : 'Verso do BI enviado.');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.'); }
    finally { setOcupado(false); }
  }

  async function prepararVideo() {
    setErro(null);
    try { setDesafios(await kycPessoal.desafio()); setVideo(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível preparar o vídeo.'); }
  }

  async function gravarVideo() {
    setErro(null); setOk(null);
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setErro('Autoriza a câmara para gravar o vídeo.'); return; }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: VIDEO_MAX_S,
      cameraType: ImagePicker.CameraType.front,
      quality: 0.5,
    });
    if (r.canceled || !r.assets[0]?.uri) return;
    const segundos = (r.assets[0].duration ?? 0) / 1000;
    if (!duracaoVideoValida(segundos)) {
      setErro(`O vídeo durou ${segundos.toFixed(1)} s. Tem de ter entre ${VIDEO_MIN_S} e ${VIDEO_MAX_S} segundos. Grava outra vez.`);
      return;
    }
    setOcupado(true);
    try {
      const tipo = tipoVideo(r.assets[0].uri);
      const caminho = await enviarFicheiroKyc(userId, r.assets[0].uri, `video-${Date.now()}.${tipo.extensao}`, tipo.contentType);
      setVideo({ caminho, segundos });
      setOk('Vídeo enviado.');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar o vídeo.'); }
    finally { setOcupado(false); }
  }

  async function enviar() {
    setErro(null); setOk(null);
    const faltam: string[] = [];
    if (!consentiu) faltam.push('o consentimento');
    if (!numeroBiValido(numero)) faltam.push('o número do BI (9 números + 2 letras + 2 números)');
    if (!fotos.frente) faltam.push('a foto da frente do BI');
    if (!fotos.verso) faltam.push('a foto do verso do BI');
    if (!video || !desafios) faltam.push('o vídeo');
    if (faltam.length) { setErro(`Falta: ${faltam.join(', ')}.`); return; }
    setOcupado(true);
    try {
      const r = await kycPessoal.enviar({
        id_number: numero.trim().toUpperCase(), id_photo_url: fotos.frente!, id_photo_back_url: fotos.verso!,
        video_url: video!.caminho, video_duration_seconds: video!.segundos, challenge_sequence: desafios!,
      });
      setOk(`Enviado! Protocolo #${r.protocol} — aguarda a revisão (até 24 h).`);
      await ler();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar para revisão.'); }
    finally { setOcupado(false); }
  }

  return (
    <Ecra>
      <Titulo>Verificação de identidade</Titulo>
      <Texto>Obrigatória para o pessoal: até ser aprovada, só tens acesso ao Mapa e à Conta.</Texto>
      {situacao.motivoAnterior ? <Caixa tipo="erro">{`Pedido anterior recusado: ${situacao.motivoAnterior}. Tentativa ${situacao.tentativa} de 3.`}</Caixa> : null}
      <Cartao>
        <Marcar rotulo="Aceito que as fotos do BI e o vídeo sejam vistos por um revisor para confirmar a minha identidade." marcado={consentiu} aoMudar={setConsentiu} />
        <Campo rotulo="Número do BI" value={numero} onChangeText={(v) => setNumero(v.toUpperCase())} placeholder="Ex.: 008807453HO45" autoCapitalize="characters" />
        {numero && !numeroBiValido(numero) ? <Texto suave>Formato: 9 números + 2 letras + 2 números.</Texto> : null}
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo="Fotos do BI" icone="identidade" cor="roxo" />
        <Botao titulo={fotos.frente ? '✓ Frente do BI' : 'Fotografar a frente do BI'} variante={fotos.frente ? 'secundario' : 'primario'} aCarregar={ocupado} onPress={() => void fotografar('frente')} />
        <Botao titulo={fotos.verso ? '✓ Verso do BI' : 'Fotografar o verso do BI'} variante={fotos.verso ? 'secundario' : 'primario'} aCarregar={ocupado} onPress={() => void fotografar('verso')} />
      </Cartao>
      <Cartao>
        <CabecalhoCartao titulo={`Vídeo (${VIDEO_MIN_S} a ${VIDEO_MAX_S} segundos)`} icone="video" cor="azul" />
        {!desafios ? <Botao titulo="Preparar o vídeo" variante="secundario" onPress={() => void prepararVideo()} /> : <>
          <Texto>Durante o vídeo, olha para a câmara e faz, por esta ordem:</Texto>
          {desafios.map((d, i) => <Texto key={d}>{`${i + 1}. ${d}`}</Texto>)}
          <Botao titulo={video ? `✓ Vídeo gravado (${video.segundos.toFixed(1)} s)` : 'Gravar o vídeo'} variante={video ? 'secundario' : 'primario'} aCarregar={ocupado} onPress={() => void gravarVideo()} />
        </>}
      </Cartao>
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {ok ? <Caixa tipo="sucesso">{ok}</Caixa> : null}
      <Botao titulo="Enviar para revisão" aCarregar={ocupado} onPress={() => void enviar()} />
    </Ecra>
  );
}
