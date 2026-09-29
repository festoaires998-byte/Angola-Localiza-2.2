import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { CamaraFachada } from '@/components/CamaraFachada';
import { dataHora } from '@/components/nomes';
import { Botao, Caixa, Cartao, Ecra, Linha, Subtitulo, Texto } from '@/components/ui';
import { linhasMarcaDeAgua } from '@/domain/enderecamento/registoMorada';
import { CORES } from '@/components/tema';
import { entregaTerminada, nomeEstadoEntrega } from '@/domain/entregas/envio';
import { estadoEfetivo, mensagemErroEstafeta, podeFechar, proximoPasso, type FicheiroProva } from '@/domain/entregas/estafeta';
import { recarregarEntregasOrganizacao, recarregarEstafeta } from '@/hooks/useEntregasEstafeta';
import { atribuirEstafeta, atualizarTrackingEntrega, listarEstafetasDisponiveis, reagendarTentativa, type EstafetaDisponivel } from '@/api/entregas';
import { useLocalProva } from '@/hooks/useLocalProva';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { acoesDaEntrega } from '@/services/entregas/estafeta';
import { servicoEstafeta } from '@/services/entregas/estafetaApp';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import { avisoAcao, definirAvisoEstafeta, useEstafeta } from '@/state/estafeta';

/** Detalhe de uma entrega do estafeta: destino, contacto, etapas e prova. */
export default function DetalheEntrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const sessao = useSessao();
  const userId = sessao.utilizador?.id ?? null;
  const cargos = sessao.perfil?.cargos ?? [];
  const podeGerirAtribuicao = cargos.includes('operador_postal') || cargos.includes('super_admin');
  const estado = useEstafeta();
  const gps = useLocalProva();
  const [foto, setFoto] = useState<FicheiroProva | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aAtribuir, setAAtribuir] = useState(false);
  const [estafetasDisponiveis, setEstafetasDisponiveis] = useState<EstafetaDisponivel[] | null>(null);
  const [aPartilharLocalizacao, setAPartilharLocalizacao] = useState(false);
  const [trackingErro, setTrackingErro] = useState<string | null>(null);
  const trackingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingBusy = useRef(false);

  useEffect(() => () => { if (trackingTimer.current) clearInterval(trackingTimer.current); }, []);

  const pararPartilhaLocalizacao = () => {
    if (trackingTimer.current) clearInterval(trackingTimer.current);
    trackingTimer.current = null;
    setAPartilharLocalizacao(false);
  };

  const alternarPartilhaLocalizacao = async () => {
    if (aPartilharLocalizacao) { pararPartilhaLocalizacao(); return; }
    if (!['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(efetivo)) return;
    setTrackingErro(null);
    const permissao = await Location.requestForegroundPermissionsAsync();
    if (permissao.status !== Location.PermissionStatus.GRANTED) { setTrackingErro('É necessária permissão de localização para partilhar o trajeto.'); return; }
    const enviar = async () => {
      if (trackingBusy.current) return;
      trackingBusy.current = true;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await atualizarTrackingEntrega(entrega.id, { latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao: pos.coords.accuracy, hora: pos.timestamp });
        setTrackingErro(null);
      } catch (e) { setTrackingErro(e instanceof Error ? e.message : 'Não foi possível atualizar a localização.'); }
      finally { trackingBusy.current = false; }
    };
    await enviar();
    trackingTimer.current = setInterval(() => void enviar(), 5000);
    setAPartilharLocalizacao(true);
  };

  const entrega = estado.entregas?.find((e) => e.id === id) ?? null;
  if (!entrega || !userId) {
    return (
      <Ecra>
        <Caixa tipo="info">Esta entrega já não está na lista.</Caixa>
        <Botao titulo="Voltar à lista" onPress={() => router.back()} />
      </Ecra>
    );
  }
  const acoes = acoesDaEntrega(entrega, estado.acoes);
  const efetivo = estadoEfetivo(entrega.estado, acoes);
  const passo = proximoPasso(efetivo);
  const m = entrega.morada;

  const escolherEstafeta = async () => {
    if (!podeGerirAtribuicao || efetivo !== 'CREATED') return;
    setErro(null);
    setAAtribuir(true);
    try {
      const estafetas = await listarEstafetasDisponiveis(entrega.id);
      if (estafetas.length === 0) {
        Alert.alert('Sem estafetas disponíveis', 'Não existem estafetas disponíveis na organização desta entrega.');
        return;
      }
      setEstafetasDisponiveis(estafetas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAAtribuir(false);
    }
  };

  const confirmarAtribuicao = (estafeta: EstafetaDisponivel) => {
    setEstafetasDisponiveis(null);
    Alert.alert(
      'Confirmar atribuição',
      'Atribuir esta entrega a ' + (estafeta.nome || estafeta.email || 'este estafeta') + '?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Atribuir',
          onPress: () => void (async () => {
            setAAtribuir(true);
            setErro(null);
            try {
              await atribuirEstafeta(entrega.id, estafeta.id);
              definirAvisoEstafeta(avisoAcao(online, 'Estafeta atribuído com sucesso.'));
              await recarregarEntregasOrganizacao().catch(() => undefined);
            } catch (err) {
              setErro(err instanceof Error ? err.message : String(err));
            } finally {
              setAAtribuir(false);
            }
          })(),
        },
      ],
    );
  };

  const reagendar = () => {
    Alert.alert('Reagendar tentativa', 'Esta entrega voltará a “Atribuída” para uma nova tentativa.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reagendar',
        onPress: () => void (async () => {
          setErro(null);
          setAEnviar(true);
          try {
            await reagendarTentativa(entrega.id);
            definirAvisoEstafeta(avisoAcao(online, 'Nova tentativa reagendada.'));
            await recarregarEstafeta(userId, online === true).catch(() => undefined);
          } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
          } finally {
            setAEnviar(false);
          }
        })(),
      },
    ]);
  };

  const fotografar = async (uriCamara: string) => {
    if (!gps.local) throw new Error('Espera pela posição do GPS.');
    const { latitude, longitude, plusCode } = gps.local;
    const pronta = await fotoComMarcaDeAgua(uriCamara, linhasMarcaDeAgua(plusCode, latitude, longitude, new Date()), 'recolha');
    setFoto(await servicoEstafeta.guardarFicheiro(pronta, 'image/jpeg'));
  };

  const avancar = async () => {
    if (!passo) return;
    setErro(null);
    setAEnviar(true);
    try {
      await servicoEstafeta.avancar(userId, entrega, passo, foto, gps.local);
      setFoto(null);
      definirAvisoEstafeta(avisoAcao(online, `"${passo.titulo}" registado.`));
      await recarregarEstafeta(userId, online === true).catch(() => undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <Ecra>
      {estado.aviso ? <Caixa tipo={estado.aviso.tipo}>{estado.aviso.texto}</Caixa> : null}
      <Botao titulo="💬 Falar com o criador da encomenda" variante="secundario" onPress={() => router.push({ pathname: '/chat-organizacao', params: { tipo: 'DELIVERY', chave: entrega.id, titulo: 'Chat da entrega' } })} />
      <Cartao>
        <Linha nome="Para" valor={entrega.destinatario} />
        <Linha nome="Estado" valor={nomeEstadoEntrega(efetivo)} />
        {m?.referencia ? <Linha nome="Referência" valor={m.referencia} /> : null}
        {m?.codigoPostal || m?.plusCode ? <Linha nome="Destino" valor={[m.codigoPostal, m.plusCode].filter(Boolean).join(' · ')} /> : null}
        {entrega.instrucoes ? <Linha nome="Instruções" valor={entrega.instrucoes} /> : null}
        {entrega.codigo ? <Linha nome="Código de rastreio" valor={entrega.codigo} /> : null}
        <Linha nome="Prioridade" valor={entrega.urgente ? 'Urgente' : 'Normal'} />
        <Linha nome="Atualizado" valor={dataHora(entrega.atualizadoEm)} />
      </Cartao>
      {entrega.telefone ? (
        <Botao titulo={`Ligar a ${entrega.destinatario}`} variante="secundario" onPress={() => void Linking.openURL(`tel:${entrega.telefone!.replace(/\s/g, '')}`)} />
      ) : null}
      {['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(efetivo) && entrega.estafeta === userId ? (
        <>
          <Botao titulo={aPartilharLocalizacao ? '⏹️ Parar partilha de localização' : '📡 Partilhar localização'} variante={aPartilharLocalizacao ? 'perigo' : 'secundario'} onPress={() => void alternarPartilhaLocalizacao()} />
          {aPartilharLocalizacao ? <Texto suave>Localização enviada a cada 5 segundos enquanto esta entrega estiver em curso.</Texto> : null}
          {trackingErro ? <Caixa tipo="erro">{trackingErro}</Caixa> : null}
        </>
      ) : null}
      {typeof m?.latitude === 'number' && typeof m?.longitude === 'number' ? (
        <Botao
          titulo="Abrir o destino no mapa"
          variante="secundario"
          onPress={() => void Linking.openURL(`geo:${m.latitude},${m.longitude}?q=${m.latitude},${m.longitude}`)}
        />
      ) : null}

      {acoes.map((a, i) =>
        a.erro === null ? (
          <Caixa key={`${a.novo}-${i}`} tipo="info">{`À espera de rede: ${nomeEstadoEntrega(a.novo)}.`}</Caixa>
        ) : (
          <Caixa key={`${a.novo}-${i}`} tipo="erro">{`Recusado pelo servidor (${nomeEstadoEntrega(a.novo)}): ${mensagemErroEstafeta(a.erro)}`}</Caixa>
        ),
      )}

      <Modal visible={estafetasDisponiveis !== null} transparent animationType="slide" onRequestClose={() => setEstafetasDisponiveis(null)}>
        <View style={estilos.modalFundo}>
          <View style={estilos.modalCartao}>
            <Subtitulo>Escolher estafeta</Subtitulo>
            <Texto suave>Estafetas da organização desta entrega.</Texto>
            <ScrollView style={estilos.listaEstafetas}>
              {(estafetasDisponiveis ?? []).map((e) => (
                <Pressable key={e.id} onPress={() => confirmarAtribuicao(e)} style={estilos.estafetaItem}>
                  <Text style={estilos.estafetaNome}>{e.nome || 'Estafeta'}</Text>
                  {e.email ? <Text style={estilos.estafetaEmail}>{e.email}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Botao titulo="Cancelar" variante="secundario" onPress={() => setEstafetasDisponiveis(null)} />
          </View>
        </View>
      </Modal>

      {podeGerirAtribuicao && efetivo === 'CREATED' ? (
        <Botao titulo="Atribuir estafeta" variante="secundario" onPress={() => void escolherEstafeta()} aCarregar={aAtribuir} />
      ) : null}

      {passo ? (
        <>
          <Subtitulo>{passo.titulo}</Subtitulo>
          {passo.precisaFoto ? (
            <>
              <Texto suave>Tira uma foto da encomenda recolhida (leva a marca de água com o local e a hora).</Texto>
              <CamaraFachada
                foto={foto?.uri ?? null}
                podeFotografar={gps.local !== null}
                motivoSemCamara={gps.texto}
                aoFotografar={fotografar}
                aoApagar={() => setFoto(null)}
                rotuloFoto="Foto da recolha"
              />
            </>
          ) : null}
          <Botao titulo={passo.titulo} onPress={() => void avancar()} desativado={passo.precisaFoto && !foto} aCarregar={aEnviar} />
        </>
      ) : null}

      {podeFechar(efetivo) ? (
        <>
          <Botao titulo="Entregar (prova de entrega)" onPress={() => router.push({ pathname: '/minhas-entregas/prova', params: { id: entrega.id } })} />
          <Botao
            titulo="Não foi possível entregar"
            variante="perigo"
            onPress={() => router.push({ pathname: '/minhas-entregas/falha', params: { id: entrega.id } })}
          />
        </>
      ) : null}

      {efetivo === 'FAILED' ? <Botao titulo="🔁 Reagendar tentativa" variante="secundario" onPress={reagendar} aCarregar={aEnviar} /> : null}
      {entregaTerminada(efetivo) ? <Texto suave>Esta entrega já terminou.</Texto> : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
    </Ecra>
  );
}


const estilos = StyleSheet.create({
  modalFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCartao: { maxHeight: '80%', padding: 20, gap: 12, backgroundColor: CORES.fundo, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  listaEstafetas: { maxHeight: 420 },
  estafetaItem: { paddingVertical: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, marginBottom: 8 },
  estafetaNome: { fontSize: 16, fontWeight: '700', color: CORES.texto },
  estafetaEmail: { marginTop: 3, fontSize: 13, color: CORES.textoSuave },
});
