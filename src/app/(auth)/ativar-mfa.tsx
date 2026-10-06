import * as Clipboard from 'expo-clipboard';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  desafiarEVerificarTotp,
  eErroDeRede,
  ErroAuth,
  inscreverTotp,
  listarFatores,
  removerFatoresPorVerificar,
  type InscricaoTotp,
} from '@/api/auth';
import { BotaoSair } from '@/components/BotaoSair';
import { CampoCodigo } from '@/components/CampoCodigo';
import { TAMANHOS, type Cores } from '@/components/tema';
import { useEstilos } from '@/components/temaApp';
import { Botao, Caixa, Cartao, Ecra, EcraCarregamento, Subtitulo, Texto, Titulo } from '@/components/ui';
import { useCargos } from '@/hooks/useCargos';
import { useSessao } from '@/hooks/useSessao';
import { sessao } from '@/state/sessao';

const SEM_REDE = 'Precisas de internet para ativar o código de segurança. Liga os dados móveis ou o Wi-Fi e tenta outra vez.';

/** "ABCD EFGH IJKL" — mais fácil de ler e de escrever à mão. */
function emBlocos(segredo: string): string {
  return segredo.replace(/(.{4})/g, '$1 ').trim();
}

function mensagem(e: unknown, alternativa: string): string {
  if (e instanceof ErroAuth && eErroDeRede(e.original)) return SEM_REDE;
  return e instanceof Error ? e.message : alternativa;
}

/** Utilizador com cargos e sem fator MFA: tem de ativar a app de autenticação. */
export default function AtivarMfa() {
  const estilos = useEstilos(fabricaEstilos);
  const router = useRouter();
  const { carregado, utilizador } = useSessao();
  const { faltaMfa } = useCargos();
  const [inscricao, setInscricao] = useState<InscricaoTotp | null>(null);
  const [erroInicio, setErroInicio] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [aVerificar, setAVerificar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!utilizador) return;
    let ativo = true;
    setErroInicio(null);
    (async () => {
      const { totpVerificados } = await listarFatores();
      if (totpVerificados.length > 0) {
        if (ativo) router.replace('/codigo-mfa');
        return;
      }
      // Uma inscrição anterior que ficou a meio impede de começar outra.
      await removerFatoresPorVerificar();
      // Nome único: o Supabase não aceita dois fatores com o mesmo nome.
      const nova = await inscreverTotp(`Angola Localiza ${Date.now()}`);
      if (ativo) setInscricao(nova);
    })().catch((e: unknown) => {
      if (ativo) setErroInicio(mensagem(e, 'Não foi possível preparar o código de segurança.'));
    });
    return () => {
      ativo = false;
    };
  }, [utilizador, tentativa, router]);

  const ativar = useCallback(
    async (valor: string) => {
      if (!inscricao || aVerificar) return;
      if (valor.length !== 6) return setErro('O código tem 6 dígitos.');
      setErro(null);
      setAVerificar(true);
      try {
        await desafiarEVerificarTotp(inscricao.factorId, valor);
        // A sessão passa a AAL2: faltaMfa fica false e o Redirect abaixo abre a app.
        await sessao.recarregar();
      } catch (e) {
        setCodigo('');
        setErro(mensagem(e, 'Não foi possível confirmar o código.'));
      } finally {
        setAVerificar(false);
      }
    },
    [inscricao, aVerificar],
  );

  async function copiar() {
    if (!inscricao) return;
    await Clipboard.setStringAsync(inscricao.segredo);
    setCopiado(true);
  }

  if (!carregado) return <EcraCarregamento />;
  if (!utilizador) return <Redirect href="/entrar" />;
  if (!faltaMfa) return <Redirect href="/" />;

  return (
    <Ecra>
      <Titulo>Proteger a tua conta</Titulo>
      <Texto>
        Como tens funções na organização, a tua conta precisa de uma proteção extra. Além da palavra-passe,
        vais usar um código de 6 dígitos que muda a cada 30 segundos. Só tens de fazer isto uma vez.
      </Texto>

      <Cartao>
        <Subtitulo>1. Instala uma app de autenticação</Subtitulo>
        <Texto>
          Na Play Store (ou na App Store), instala uma app de autenticação, por exemplo o Google
          Authenticator. É gratuita.
        </Texto>
      </Cartao>

      <Cartao>
        <Subtitulo>2. Junta o Angola Localiza a essa app</Subtitulo>
        <Texto>
          Na app de autenticação, carrega em &quot;+&quot; ou &quot;Adicionar&quot; e lê este código QR com a
          câmara.
        </Texto>
        {inscricao ? (
          <>
            <View style={estilos.qr} accessibilityLabel="Código QR para a app de autenticação">
              <QRCode value={inscricao.uri} size={220} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <Texto>
              A app está neste mesmo telemóvel e não consegues ler o QR? Escolhe &quot;Introduzir chave de
              configuração&quot; e cola esta chave secreta:
            </Texto>
            <Text selectable style={estilos.segredo} accessibilityLabel="Chave secreta">
              {emBlocos(inscricao.segredo)}
            </Text>
            <Botao
              titulo={copiado ? 'Copiado ✓' : 'Copiar'}
              variante="secundario"
              onPress={() => void copiar()}
            />
            <Texto suave>Não partilhes esta chave com ninguém.</Texto>
          </>
        ) : erroInicio ? (
          <>
            <Caixa tipo="erro">{erroInicio}</Caixa>
            <Botao titulo="Tentar outra vez" onPress={() => setTentativa((n) => n + 1)} />
          </>
        ) : (
          <Texto suave>A preparar o código QR…</Texto>
        )}
      </Cartao>

      <Cartao>
        <Subtitulo>3. Escreve o código</Subtitulo>
        <Texto>Escreve aqui o código de 6 dígitos que a app de autenticação mostra agora.</Texto>
        <CampoCodigo valor={codigo} aoMudar={setCodigo} aoCompletar={(c) => void ativar(c)} />
        {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
        <Botao
          titulo="Ativar"
          desativado={!inscricao}
          aCarregar={aVerificar}
          onPress={() => void ativar(codigo)}
        />
      </Cartao>

      <BotaoSair />
    </Ecra>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  qr: { alignSelf: 'center', padding: 16, backgroundColor: '#FFFFFF' },
  segredo: {
    fontSize: TAMANHOS.subtitulo,
    fontWeight: '700',
    letterSpacing: 1,
    color: CORES.texto,
    backgroundColor: CORES.fundoSuave,
    padding: 12,
    borderRadius: TAMANHOS.raio,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
