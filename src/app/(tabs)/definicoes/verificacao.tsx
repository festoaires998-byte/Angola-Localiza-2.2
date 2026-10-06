import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { CamaraFachada } from '@/components/CamaraFachada';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, CabecalhoCartao, Caixa, Cartao, EcraCarregamento, Texto } from '@/components/ui';
import { EMOJI_DESAFIO, escolherDesafio, linhasMarcaVerificacao } from '@/domain/identidade/verificacaoSimples';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import type { FotoComMarca } from '@/services/imagem/fotoComMarca';
import { fotoComMarcaDeAgua, fotosLadoALadoComMarca } from '@/services/imagem/fotoComMarca';
import type { EstadoVerificacao } from '@/services/identidade/verificacao';
import { servicoVerificacao } from '@/services/identidade/verificacaoApp';

type Resultado = { tipo: 'sucesso' | 'info' | 'erro'; texto: string };

export default function VerificacaoSimples() {
  const router = useRouter();
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const [estado, setEstado] = useState<EstadoVerificacao | null>(null);
  const [desafio] = useState(() => escolherDesafio());
  const [frente, setFrente] = useState<FotoComMarca | null>(null);
  const [verso, setVerso] = useState<FotoComMarca | null>(null);
  /** 1.ª selfie (ainda por juntar com a do gesto). */
  const [selfieCrua, setSelfieCrua] = useState<string | null>(null);
  const [selfies, setSelfies] = useState<FotoComMarca | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const ler = () => {
    if (!userId) return;
    void servicoVerificacao.estado(userId).then(setEstado);
    void servicoVerificacao.motivoRecusa(userId).then(setMotivo);
  };
  useEffect(ler, [userId]);
  // Com rede, pergunta ao servidor se um administrador já aprovou ou recusou.
  useEffect(() => {
    if (userId && online) void servicoVerificacao.atualizarDoServidor(userId).then(ler);
  }, [userId, online]);

  if (!userId || estado === null) return <EcraCarregamento texto="A abrir…" />;

  const enviarAgora = async () => {
    setAEnviar(true);
    const r = await servicoVerificacao.enviarPendente(userId);
    setAEnviar(false);
    if (r.resultado === 'verificado' || r.resultado === 'em_revisao') setResultado(textoEnviado(r.resultado));
    else if (r.resultado === 'falhou') setResultado({ tipo: 'erro', texto: `Ainda não foi possível enviar: ${r.erro}` });
    ler();
  };

  if (estado === 'verificado') {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Caixa tipo="sucesso">A tua identidade já está verificada ✅ Podes registar moradas.</Caixa>
        <Botao titulo="Voltar" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  if (estado === 'em_revisao') {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        {resultado ? <Caixa tipo={resultado.tipo}>{resultado.texto}</Caixa> : null}
        <Caixa tipo="info">
          A tua verificação foi enviada e está em revisão pela equipa. Quando for aprovada, já podes registar moradas.
        </Caixa>
        <Botao titulo="Voltar" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const guardar = async () => {
    if (!frente || !verso || !selfies) return;
    setAEnviar(true);
    setResultado(null);
    try {
      await servicoVerificacao.guardarPedido(userId, {
        frente: { uri: frente.uri, sha256: frente.sha256 },
        verso: { uri: verso.uri, sha256: verso.sha256 },
        selfie: { uri: selfies.uri, sha256: selfies.sha256 },
      });
      if (online) {
        const r = await servicoVerificacao.enviarPendente(userId);
        setResultado(
          r.resultado === 'verificado' || r.resultado === 'em_revisao'
            ? textoEnviado(r.resultado)
            : { tipo: 'info', texto: `Guardado neste telemóvel. Ainda não foi possível enviar (${r.erro}); tenta de novo mais tarde.` },
        );
      } else {
        setResultado({ tipo: 'info', texto: 'Sem rede: ficou guardado neste telemóvel e é enviado sozinho quando houver rede.' });
      }
      // As fotos passam a ser do pedido guardado: o formulário fecha.
      setFrente(null);
      setVerso(null);
      setSelfieCrua(null);
      setSelfies(null);
    } catch (e) {
      setResultado({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setAEnviar(false);
      ler();
    }
  };

  if (estado === 'pendente' && !frente) {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Caixa tipo="info">
          A tua verificação está guardada neste telemóvel e é enviada sozinha quando houver rede. Depois, a equipa
          revê-a; quando for aprovada, já podes registar moradas.
        </Caixa>
        {resultado ? <Caixa tipo={resultado.tipo}>{resultado.texto}</Caixa> : null}
        {online ? <Botao titulo="Enviar agora" onPress={() => void enviarAgora()} aCarregar={aEnviar} /> : null}
        <Botao titulo="Voltar" variante="secundario" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const pronto = !!frente && !!verso && !!selfies;

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      {estado === 'rejeitado' ? (
        <Caixa tipo="erro">
          {`A tua verificação não foi aprovada${motivo ? `: ${motivo}` : '.'} Tira as fotos de novo e envia outra vez.`}
        </Caixa>
      ) : null}
      <Texto>
        Para registares moradas, confirma que és tu: tira uma foto do BI (frente e verso) e duas selfies. Leva 2
        minutos e funciona sem rede.
      </Texto>
      <Texto suave>
        As fotos levam uma marca de água com a data e hora e vão para um arquivo privado: só a equipa de verificação
        as vê. Depois de enviadas, são apagadas deste telemóvel.
      </Texto>

      <Cartao>
        <CabecalhoCartao titulo="1. BI — frente" icone="identidade" cor="roxo" />
        <Texto suave>Põe o BI numa superfície lisa, com boa luz, e enquadra-o todo.</Texto>
        <CamaraFachada
          foto={frente?.uri ?? null}
          podeFotografar
          rotuloFoto="Foto do BI (frente)"
          aoFotografar={async (uri) => setFrente(await fotoComMarcaDeAgua(uri, linhasMarcaVerificacao(new Date()), 'bi-frente'))}
          aoApagar={() => setFrente(null)}
        />
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="2. BI — verso" icone="identidade" cor="roxo" />
        <CamaraFachada
          foto={verso?.uri ?? null}
          podeFotografar={!!frente}
          motivoSemCamara="Primeiro a frente do BI."
          rotuloFoto="Foto do BI (verso)"
          aoFotografar={async (uri) => setVerso(await fotoComMarcaDeAgua(uri, linhasMarcaVerificacao(new Date()), 'bi-verso'))}
          aoApagar={() => setVerso(null)}
        />
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="3. Selfie" icone="camara" cor="azul" />
        <Texto suave>Olha de frente para a câmara, com a cara toda visível.</Texto>
        <CamaraFachada
          foto={selfieCrua}
          mostrarFoto={false}
          camara="front"
          podeFotografar={!!verso}
          motivoSemCamara="Primeiro as fotos do BI."
          rotuloFoto="Selfie"
          aoFotografar={async (uri) => {
            setSelfies(null);
            setSelfieCrua(uri);
          }}
          aoApagar={() => {
            setSelfieCrua(null);
            setSelfies(null);
          }}
        />
        {selfieCrua ? <Texto suave>Primeira selfie tirada ✓</Texto> : null}
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="4. Selfie com um gesto" icone="camara" cor="azul" />
        {/* O emoji mostra o gesto de relance; o texto diz o mesmo (e é o que os leitores de ecrã leem). */}
        <Text style={estilos.emojiDesafio} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="emoji-desafio">
          {EMOJI_DESAFIO[desafio]}
        </Text>
        <Text style={estilos.desafio} accessibilityRole="header">{`Agora: ${desafio.toLowerCase()}.`}</Text>
        <Texto suave>Isto mostra que és mesmo tu, agora (e não uma foto de outra pessoa).</Texto>
        <CamaraFachada
          foto={selfies?.uri ?? null}
          camara="front"
          podeFotografar={!!selfieCrua}
          motivoSemCamara="Primeiro a selfie normal."
          rotuloFoto="As duas selfies"
          aoFotografar={async (uri) => {
            if (!selfieCrua) throw new Error('Tira primeiro a selfie normal.');
            setSelfies(await fotosLadoALadoComMarca(selfieCrua, uri, linhasMarcaVerificacao(new Date(), desafio)));
          }}
          aoApagar={() => setSelfies(null)}
        />
      </Cartao>

      {resultado ? <Caixa tipo={resultado.tipo}>{resultado.texto}</Caixa> : null}
      <Botao
        titulo={online === false ? 'Guardar para enviar' : 'Enviar a verificação'}
        onPress={() => void guardar()}
        desativado={!pronto}
        aCarregar={aEnviar}
      />
    </ScrollView>
  );
}

function textoEnviado(r: 'verificado' | 'em_revisao'): Resultado {
  return r === 'verificado'
    ? { tipo: 'sucesso', texto: 'Verificação feita ✅ Já podes registar moradas.' }
    : { tipo: 'sucesso', texto: 'Verificação enviada ✅ A equipa vai rever as fotos.' };
}

const estilos = StyleSheet.create({
  conteudo: { padding: TAMANHOS.margem, gap: 12 },
  desafio: { fontSize: TAMANHOS.subtitulo, fontWeight: '800', color: CORES.primaria },
  emojiDesafio: { fontSize: 72, lineHeight: 88, textAlign: 'center' },
});
