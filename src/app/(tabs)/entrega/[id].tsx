import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { dataHora } from '@/components/nomes';
import { type Cores } from '@/components/tema';
import { useEstilos } from '@/components/temaApp';
import { Botao, CabecalhoCartao, Caixa, Cartao, Ecra, Linha, Texto } from '@/components/ui';
import { entregaTerminada, mensagemErroEnvio, nomeEstadoEntrega, podeCancelar } from '@/domain/entregas/envio';
import { useOnline } from '@/hooks/useOnline';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { guardarEnvio, guardarPin, useEnvios } from '@/state/envios';

/** Detalhe de um envio: estado, código de rastreio, PIN (só para quem criou) e cancelar. */
export default function DetalheEnvio() {
  const estilos = useEstilos(fabricaEstilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const estado = useEnvios();
  const [aTrabalhar, setATrabalhar] = useState<'pin' | 'novo' | 'cancelar' | 'urgente' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const envio = estado.envios?.find((e) => e.id === id) ?? null;
  if (!envio) {
    return (
      <Ecra>
        <Caixa tipo="info">Este envio já não está na lista.</Caixa>
        <Botao titulo="Voltar à lista" onPress={() => router.back()} />
      </Ecra>
    );
  }
  const pin = estado.pins[envio.id] ?? null;
  const terminada = entregaTerminada(envio.estado);

  async function trabalhar(tipo: 'pin' | 'novo' | 'cancelar' | 'urgente', acao: () => Promise<void>) {
    setErro(null);
    setATrabalhar(tipo);
    try {
      await acao();
    } catch (e) {
      setErro(mensagemErroEnvio(e instanceof Error ? e.message : String(e)));
    } finally {
      setATrabalhar(null);
    }
  }

  const textoPartilha = [
    'Angola Localiza — envio',
    envio.codigo ? `Código de rastreio: ${envio.codigo}` : null,
    `Destinatário: ${envio.destinatario}`,
    envio.morada?.codigoPostal ? `Destino: ${envio.morada.codigoPostal}` : null,
  ].filter(Boolean).join('\\n');

  const partilharEnvio = () => {
    void Share.share({ message: textoPartilha }).catch(() => undefined);
  };
  const copiarCodigo = () => { if (envio.codigo) void Clipboard.setStringAsync(envio.codigo); };
  const abrirWhatsApp = () => {
    if (!envio.telefone) return;
    const digits = envio.telefone.replace(/\\D/g, '');
    const mensagem = encodeURIComponent(textoPartilha);
    void Linking.openURL(`https://wa.me/${digits}?text=${mensagem}`).catch(() => undefined);
  };
  const alternarUrgencia = () => trabalhar('urgente', async () => {
    await servicoEnvios.definirUrgencia(envio.id, !envio.urgente);
    guardarEnvio({ ...envio, urgente: !envio.urgente }, pin);
  });

  const mostrarPin = () => trabalhar('pin', async () => guardarPin(envio.id, await servicoEnvios.lerPin(envio.id)));
  const gerarPin = () =>
    Alert.alert(
      'Gerar um PIN novo?',
      'O PIN antigo deixa de servir. Dá o novo só a quem vai receber a encomenda.',
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Gerar PIN novo', onPress: () => void trabalhar('novo', async () => guardarPin(envio.id, await servicoEnvios.gerarPin(envio.id))) },
      ],
      { cancelable: true },
    );
  const cancelar = () =>
    Alert.alert(
      'Cancelar o envio?',
      'O estafeta deixa de o poder entregar. Não é possível voltar atrás.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar o envio',
          style: 'destructive',
          onPress: () =>
            void trabalhar('cancelar', async () => {
              guardarEnvio(await servicoEnvios.cancelar(envio), null, { tipo: 'sucesso', texto: 'Envio cancelado.' });
              router.back();
            }),
        },
      ],
      { cancelable: true },
    );

  return (
    <Ecra>
      {estado.aviso?.tipo === 'sucesso' && pin ? <Caixa tipo="sucesso">{estado.aviso.texto}</Caixa> : null}
      <Botao titulo="💬 Falar com o estafeta" variante="secundario" onPress={() => router.push({ pathname: '/chat-organizacao', params: { tipo: 'DELIVERY', chave: envio.id, titulo: 'Chat da entrega' } })} />
      <Cartao>
        {envio.origem ? (
          <Linha
            nome="Origem"
            valor={[envio.origem.codigoPostal, envio.origem.plusCode].filter(Boolean).join(' · ') || 'Posição capturada'}
          />
        ) : null}
        <Linha nome="Para" valor={envio.destinatario} />
        <Linha nome="Estado" valor={nomeEstadoEntrega(envio.estado)} />
        {envio.codigo ? (
          <>
            <Linha nome="Código de rastreio" valor={envio.codigo} />
            <View style={estilos.qrBloco}>
              <Text style={estilos.qrTitulo}>QR de rastreio</Text>
              <View style={estilos.qrCaixa}>
                <QRCode value={`angola-localiza://rastreio/${envio.codigo}`} size={150} quietZone={8} />
              </View>
              <Texto suave>Lê este QR para identificar este envio.</Texto>
            </View>
            <Botao titulo="Partilhar envio" variante="secundario" onPress={partilharEnvio} />
            <Botao titulo="Copiar código de rastreio" variante="secundario" onPress={copiarCodigo} />
            {envio.telefone ? <Botao titulo="WhatsApp do destinatário" variante="secundario" onPress={abrirWhatsApp} /> : null}
          </>
        ) : null}
        {envio.morada?.codigoPostal || envio.morada?.plusCode ? (
          <Linha nome="Destino" valor={[envio.morada.codigoPostal, envio.morada.plusCode].filter(Boolean).join(' · ')} />
        ) : null}
        {envio.morada?.referencia ? <Linha nome="Referência" valor={envio.morada.referencia} /> : null}
        {envio.telefone ? <Linha nome="Telefone" valor={envio.telefone} /> : null}
        {envio.instrucoes ? <Linha nome="Instruções" valor={envio.instrucoes} /> : null}
        <Linha nome="Prioridade" valor={envio.urgente ? 'Urgente' : 'Normal'} />
        {!terminada ? <Botao titulo={envio.urgente ? 'Desmarcar urgente' : '🔴 Marcar urgente'} variante="secundario" onPress={alternarUrgencia} aCarregar={aTrabalhar === 'urgente'} /> : null}
        <Linha nome="Atualizado" valor={dataHora(envio.atualizadoEm)} />
      </Cartao>

      {!terminada ? (
        <>
          <CabecalhoCartao titulo="PIN de confirmação" icone="pin" cor="verde" />
          {pin ? (
            <Cartao>
              <Text
                style={estilos.pin}
                accessibilityLabel={`PIN ${pin.pin.split('').join(' ')}`}
                testID="pin-envio"
              >
                {pin.pin}
              </Text>
              <Texto>Dá este PIN só a quem vai receber. O estafeta pede-o para fechar a entrega.</Texto>
              {pin.expiraEm ? <Texto suave>{`Vale até ${dataHora(pin.expiraEm)}.`}</Texto> : null}
            </Cartao>
          ) : (
            <Texto suave>Por segurança, o PIN não fica guardado neste telemóvel.</Texto>
          )}
          {pin?.bloqueado ? (
            <Caixa tipo="aviso">Alguém errou o PIN 5 vezes e a entrega ficou bloqueada. Gera um PIN novo.</Caixa>
          ) : null}
          {online === false ? (
            <Caixa tipo="info">Sem rede. Ver ou gerar o PIN precisa de rede.</Caixa>
          ) : (
            <>
              {!pin ? <Botao titulo="Mostrar o PIN" onPress={() => void mostrarPin()} aCarregar={aTrabalhar === 'pin'} /> : null}
              <Botao titulo="Gerar um PIN novo" variante="secundario" onPress={gerarPin} aCarregar={aTrabalhar === 'novo'} />
            </>
          )}
        </>
      ) : null}

      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}

      {podeCancelar(envio.estado) && online !== false ? (
        <Botao titulo="Cancelar o envio" variante="perigo" onPress={cancelar} aCarregar={aTrabalhar === 'cancelar'} />
      ) : null}
    </Ecra>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  qrBloco: { gap: 8, alignItems: 'center', paddingTop: 8 },
  qrTitulo: { fontSize: 15, fontWeight: '700', color: CORES.textoSuave },
  qrCaixa: { padding: 4, backgroundColor: '#FFFFFF', borderRadius: 8 },

  pin: { fontSize: 48, fontWeight: '800', letterSpacing: 12, color: CORES.primaria, textAlign: 'center' },
});
