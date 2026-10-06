import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { abrirFotosKyc, decidirPedidoKyc, lerFotoKyc } from '@/api/revisaoKyc';
import { TAMANHOS, type Cores } from '@/components/tema';
import { useEstilos, useCores } from '@/components/temaApp';
import { Botao, Caixa, Campo, Cartao, Subtitulo, Texto } from '@/components/ui';
import {
  dataEnvio,
  detalhesDoPedido,
  erroMotivo,
  MOTIVOS_RAPIDOS,
  nomeDoPedido,
  podeReverKyc,
  type FotosKyc,
  type PedidoKyc,
} from '@/domain/identidade/revisaoKyc';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { marcarDecidido, useRevisaoKyc } from '@/state/revisaoKyc';

/**
 * Admin: detalhe de uma verificação por rever (ecrã próprio, por cima da
 * lista). As fotos são privadas: só se pedem ao abrir (o servidor regista
 * quem as viu), chegam por links temporários (10 min) e ficam só na memória
 * deste ecrã. Aprovar pede confirmação num alerta do sistema; recusar pede o
 * motivo. Depois da decisão, volta à lista.
 */
export default function DetalheVerificacao() {
  const estilos = useEstilos(fabricaEstilos);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const revisor = podeReverKyc(useSessao().perfil?.cargos ?? []);
  const { pedidos } = useRevisaoKyc();
  const pedido = pedidos?.find((p) => p.userId === id) ?? null;

  const conteudo = !revisor ? (
    <Caixa tipo="info">Só os administradores podem aprovar ou recusar verificações de identidade.</Caixa>
  ) : online === false ? (
    <Caixa tipo="aviso">Sem rede. A revisão das verificações precisa de rede (as fotos não ficam neste telemóvel).</Caixa>
  ) : !pedido ? (
    <>
      <Caixa tipo="info">Este pedido já não está na lista (foi decidido ou a lista mudou).</Caixa>
      <Botao titulo="Voltar à lista" onPress={() => router.back()} />
    </>
  ) : (
    <RevisaoPedido
      key={pedido.userId}
      pedido={pedido}
      aoDecidir={(aprovado) => {
        const quem = nomeDoPedido(pedido);
        marcarDecidido(
          pedido.userId,
          aprovado
            ? { tipo: 'sucesso', texto: `Verificação de ${quem} aprovada ✅ O cidadão já pode registar moradas.` }
            : { tipo: 'info', texto: `Verificação de ${quem} recusada. O cidadão recebe o motivo.` },
        );
        router.back();
      }}
    />
  );
  return <ScrollView contentContainerStyle={estilos.conteudo}>{conteudo}</ScrollView>;
}

function RevisaoPedido({ pedido, aoDecidir }: { pedido: PedidoKyc; aoDecidir(aprovado: boolean): void }) {
  const estilos = useEstilos(fabricaEstilos);
  const CORES = useCores();
  const [fotos, setFotos] = useState<FotosKyc | null>(null);
  const [erroFotos, setErroFotos] = useState<string | null>(null);
  const [pedidoFotos, setPedidoFotos] = useState(0);
  // Pede os links das fotos ao abrir (e outra vez em "Pedir links novos").
  useEffect(() => {
    let ativo = true;
    setFotos(null);
    setErroFotos(null);
    abrirFotosKyc(pedido.userId).then(
      (f) => ativo && setFotos(f),
      (e: unknown) => ativo && setErroFotos(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      ativo = false;
    };
  }, [pedido.userId, pedidoFotos]);
  const linksNovos = () => setPedidoFotos((n) => n + 1);

  const [modo, setModo] = useState<'ver' | 'recusar'>('ver');
  const [motivo, setMotivo] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const problemaMotivo = erroMotivo(motivo);

  // Aprovar deixa a pessoa registar moradas: pede confirmação num alerta do sistema.
  const confirmarAprovacao = () =>
    Alert.alert(
      'Aprovar a verificação?',
      `${nomeDoPedido(pedido)} passa a poder registar moradas. Confirmas que o BI é legível e que as selfies são desta pessoa?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aprovar', onPress: () => void decidir(true) },
      ],
      { cancelable: true },
    );

  const decidir = async (aprovar: boolean) => {
    setAEnviar(true);
    setErro(null);
    try {
      await decidirPedidoKyc(pedido.userId, aprovar ? { aprovar: true } : { aprovar: false, motivo });
      aoDecidir(aprovar);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setAEnviar(false);
    }
  };

  return (
    <View style={estilos.bloco}>
      <Text style={estilos.nomePedido}>{nomeDoPedido(pedido)}</Text>
      {detalhesDoPedido(pedido).map((l) => (
        <Texto key={l} suave>
          {l}
        </Texto>
      ))}
      <Texto suave>{`Enviado a ${dataEnvio(pedido.enviadoEm)}`}</Texto>
      <Texto suave>
        Confirma que o BI é legível, que a cara da selfie é a do BI e que a segunda selfie mostra o gesto escrito na
        marca de água.
      </Texto>
      {erroFotos ? (
        <>
          <Caixa tipo="erro">{`Não foi possível abrir as fotos: ${erroFotos}`}</Caixa>
          <Botao titulo="Tentar de novo" variante="secundario" onPress={linksNovos} />
        </>
      ) : !fotos ? (
        <ActivityIndicator accessibilityLabel="A abrir as fotos" color={CORES.primaria} />
      ) : (
        <>
          <FotoPrivada titulo="BI — frente" url={fotos.frente} aoExpirar={linksNovos} />
          <FotoPrivada titulo="BI — verso" url={fotos.verso} aoExpirar={linksNovos} />
          <FotoPrivada titulo="Selfies (normal e com o gesto)" url={fotos.selfie} aoExpirar={linksNovos} />
        </>
      )}

      {erro ? <Caixa tipo="erro">{`Não foi possível guardar a decisão: ${erro}`}</Caixa> : null}

      {modo === 'ver' ? (
        <>
          <Botao titulo="Aprovar" onPress={confirmarAprovacao} aCarregar={aEnviar} />
          <Botao titulo="Recusar" variante="secundario" onPress={() => setModo('recusar')} desativado={aEnviar} />
        </>
      ) : null}

      {modo === 'recusar' ? (
        <>
          <Subtitulo>Motivo da recusa</Subtitulo>
          <Texto suave>O cidadão vê este motivo e tem de tirar as fotos de novo.</Texto>
          {MOTIVOS_RAPIDOS.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`Motivo: ${m}`}
              onPress={() => setMotivo(m)}
              style={[estilos.motivo, motivo === m && estilos.motivoEscolhido]}
            >
              <Text style={estilos.textoMotivo}>{m}</Text>
            </Pressable>
          ))}
          <Campo rotulo="Motivo da recusa" value={motivo} onChangeText={setMotivo} multiline maxLength={300} />
          {motivo.length > 0 && problemaMotivo ? <Texto suave>{problemaMotivo}</Texto> : null}
          <Botao
            titulo="Recusar a verificação"
            onPress={() => void decidir(false)}
            desativado={!!problemaMotivo}
            aCarregar={aEnviar}
          />
          <Botao titulo="Cancelar" variante="secundario" onPress={() => setModo('ver')} desativado={aEnviar} />
        </>
      ) : null}
    </View>
  );
}

/** Uma foto do bucket privado, mostrada só a partir da memória. */
function FotoPrivada({ titulo, url, aoExpirar }: { titulo: string; url: string | null; aoExpirar(): void }) {
  const estilos = useEstilos(fabricaEstilos);
  const CORES = useCores();
  const [dados, setDados] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro(null);
    if (url) {
      lerFotoKyc(url).then(
        (d) => ativo && setDados(d),
        (e: unknown) => ativo && setErro(e instanceof Error ? e.message : String(e)),
      );
    }
    return () => {
      ativo = false;
    };
  }, [url]);

  return (
    <Cartao>
      <Subtitulo>{titulo}</Subtitulo>
      {!url ? (
        <Caixa tipo="erro">Esta foto não está no arquivo.</Caixa>
      ) : dados ? (
        <Image source={{ uri: dados }} style={estilos.foto} resizeMode="contain" accessibilityLabel={`Foto: ${titulo}`} />
      ) : erro ? (
        <>
          <Caixa tipo="erro">{`A foto não abriu: ${erro}`}</Caixa>
          <Botao titulo="Pedir links novos" variante="secundario" onPress={aoExpirar} />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel={`A abrir: ${titulo}`} color={CORES.primaria} />
      )}
    </Cartao>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  conteudo: { padding: TAMANHOS.margem, gap: 12 },
  bloco: { gap: 12 },
  nomePedido: { fontSize: TAMANHOS.subtitulo, fontWeight: '800', color: CORES.texto },
  foto: { width: '100%', height: 260, backgroundColor: '#000' },
  motivo: {
    borderWidth: 2,
    borderColor: CORES.borda,
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  motivoEscolhido: { borderColor: CORES.primaria, backgroundColor: CORES.avisoFundo },
  textoMotivo: { fontSize: TAMANHOS.texto, color: CORES.texto },
});
