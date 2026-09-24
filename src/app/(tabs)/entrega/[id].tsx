import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { dataHora } from '@/components/nomes';
import { CORES } from '@/components/tema';
import { Botao, Caixa, Cartao, Ecra, Linha, Subtitulo, Texto } from '@/components/ui';
import { entregaTerminada, mensagemErroEnvio, nomeEstadoEntrega, podeCancelar } from '@/domain/entregas/envio';
import { useOnline } from '@/hooks/useOnline';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { guardarEnvio, guardarPin, useEnvios } from '@/state/envios';

/** Detalhe de um envio: estado, código de rastreio, PIN (só para quem criou) e cancelar. */
export default function DetalheEnvio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const estado = useEnvios();
  const [aTrabalhar, setATrabalhar] = useState<'pin' | 'novo' | 'cancelar' | null>(null);
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

  async function trabalhar(tipo: 'pin' | 'novo' | 'cancelar', acao: () => Promise<void>) {
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
      <Cartao>
        <Linha nome="Para" valor={envio.destinatario} />
        <Linha nome="Estado" valor={nomeEstadoEntrega(envio.estado)} />
        {envio.codigo ? <Linha nome="Código de rastreio" valor={envio.codigo} /> : null}
        {envio.morada?.codigoPostal || envio.morada?.plusCode ? (
          <Linha nome="Destino" valor={[envio.morada.codigoPostal, envio.morada.plusCode].filter(Boolean).join(' · ')} />
        ) : null}
        {envio.morada?.referencia ? <Linha nome="Referência" valor={envio.morada.referencia} /> : null}
        {envio.telefone ? <Linha nome="Telefone" valor={envio.telefone} /> : null}
        {envio.instrucoes ? <Linha nome="Instruções" valor={envio.instrucoes} /> : null}
        <Linha nome="Prioridade" valor={envio.urgente ? 'Urgente' : 'Normal'} />
        <Linha nome="Atualizado" valor={dataHora(envio.atualizadoEm)} />
      </Cartao>

      {!terminada ? (
        <>
          <Subtitulo>PIN de confirmação</Subtitulo>
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

const estilos = StyleSheet.create({
  pin: { fontSize: 48, fontWeight: '800', letterSpacing: 12, color: CORES.primaria, textAlign: 'center' },
});
