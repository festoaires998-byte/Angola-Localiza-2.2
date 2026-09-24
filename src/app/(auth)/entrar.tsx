import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';

import { eErroDeRede, ErroAuth, entrar } from '@/api/auth';
import { Botao, Caixa, Campo, Ecra, Ligacao, Texto, Titulo } from '@/components/ui';
import { useSessao } from '@/hooks/useSessao';
import { estaOnline } from '@/services/rede/conectividade';
import { sessao } from '@/state/sessao';

export const SEM_REDE_ENTRAR =
  'Precisas de internet para entrar pela primeira vez neste telemóvel. ' +
  'Liga os dados móveis ou o Wi-Fi e tenta outra vez. Depois de entrares, a app funciona sem rede.';

export default function Entrar() {
  const router = useRouter();
  const { utilizador } = useSessao();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aEntrar, setAEntrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (utilizador && !aEntrar) return <Redirect href="/" />;

  async function carregar() {
    setErro(null);
    if (!email.trim() || !password) {
      setErro('Escreve o email e a palavra-passe.');
      return;
    }
    setAEntrar(true);
    try {
      if (!(await estaOnline())) {
        setErro(SEM_REDE_ENTRAR);
        return;
      }
      const r = await entrar(email, password);
      // Os cargos novos só existem depois de aceitar o convite: volta a lê-los.
      if (r.adesao.estado === 'aderiu') await sessao.recarregar();
    } catch (e) {
      if (e instanceof ErroAuth && eErroDeRede(e.original)) setErro(SEM_REDE_ENTRAR);
      else setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setAEntrar(false);
    }
  }

  return (
    <Ecra centrado>
      <Titulo>Angola Localiza</Titulo>
      <Texto>Entra com o teu email e a tua palavra-passe.</Texto>
      <Campo
        rotulo="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="nome@exemplo.ao"
      />
      <Campo
        rotulo="Palavra-passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void carregar()}
      />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Entrar" aCarregar={aEntrar} onPress={() => void carregar()} />
      <Ligacao titulo="Criar conta" onPress={() => router.push('/criar-conta')} />
      <Ligacao titulo="Esqueci-me da palavra-passe" onPress={() => router.push('/recuperar-password')} />
    </Ecra>
  );
}
