import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { desafiarEVerificarTotp, eErroDeRede, ErroAuth, listarFatores } from '@/api/auth';
import { BotaoSair } from '@/components/BotaoSair';
import { CampoCodigo } from '@/components/CampoCodigo';
import { Botao, Caixa, Ecra, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { useCargos } from '@/hooks/useCargos';
import { useSessao } from '@/hooks/useSessao';
import { sessao } from '@/state/sessao';

const SEM_REDE = 'Precisas de internet para confirmar o código. Liga os dados móveis ou o Wi-Fi e tenta outra vez.';

/** Sessão AAL1 de quem já tem a app de autenticação configurada: pede os 6 dígitos. */
export default function CodigoMfa() {
  const router = useRouter();
  const { carregado, utilizador } = useSessao();
  const { faltaMfa, passoMfa } = useCargos();
  // "depois=nova-password": veio do ecrã de nova palavra-passe (o servidor pede AAL2).
  const { depois } = useLocalSearchParams<{ depois?: string }>();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aVerificar, setAVerificar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!utilizador) return;
    let ativo = true;
    setErro(null);
    listarFatores()
      .then(({ totpVerificados }) => {
        if (!ativo) return;
        if (totpVerificados.length === 0) router.replace('/ativar-mfa');
        else setFactorId(totpVerificados[0].id);
      })
      .catch((e: unknown) => {
        if (!ativo) return;
        setErro(e instanceof ErroAuth && !eErroDeRede(e.original) ? e.message : SEM_REDE);
      });
    return () => {
      ativo = false;
    };
  }, [utilizador, tentativa, router]);

  const verificar = useCallback(
    async (valor: string) => {
      if (!factorId || aVerificar) return;
      if (valor.length !== 6) return setErro('O código tem 6 dígitos.');
      setErro(null);
      setAVerificar(true);
      try {
        await desafiarEVerificarTotp(factorId, valor);
        await sessao.recarregar();
        if (depois === 'nova-password') router.replace('/nova-password');
        // Nos outros casos, faltaMfa passa a false e o Redirect abaixo trata do resto.
      } catch (e) {
        setCodigo('');
        if (e instanceof ErroAuth && eErroDeRede(e.original)) setErro(SEM_REDE);
        else setErro(e instanceof Error ? e.message : 'Não foi possível confirmar o código.');
      } finally {
        setAVerificar(false);
      }
    },
    [factorId, aVerificar, depois, router],
  );

  if (!carregado) return <EcraCarregamento />;
  if (!utilizador) return <Redirect href="/entrar" />;
  if (!depois && !faltaMfa) return <Redirect href="/" />;
  if (!depois && passoMfa === 'inscrever') return <Redirect href="/ativar-mfa" />;

  return (
    <Ecra>
      <Titulo>Código de segurança</Titulo>
      <Texto>
        Abre a tua app de autenticação (por exemplo, Google Authenticator) e escreve aqui o código de 6
        dígitos que aparece para o Angola Localiza.
      </Texto>
      <Texto suave>O código muda a cada 30 segundos. Se estiver quase a mudar, espera pelo seguinte.</Texto>
      <CampoCodigo valor={codigo} aoMudar={setCodigo} aoCompletar={(c) => void verificar(c)} />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {factorId ? (
        <Botao titulo="Confirmar" aCarregar={aVerificar} onPress={() => void verificar(codigo)} />
      ) : erro ? (
        <Botao titulo="Tentar outra vez" onPress={() => setTentativa((n) => n + 1)} />
      ) : (
        <Botao titulo="A preparar…" aCarregar onPress={() => undefined} />
      )}
      <Texto suave>Perdeste o telemóvel com a app de autenticação? Fala com o teu administrador.</Texto>
      <BotaoSair />
    </Ecra>
  );
}
