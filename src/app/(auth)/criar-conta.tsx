import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';

import { criarConta, eErroDeRede, ErroAuth } from '@/api/auth';
import { Botao, Caixa, Campo, Ecra, Ligacao, Texto, Titulo } from '@/components/ui';
import { useSessao } from '@/hooks/useSessao';
import { LINK_EMAIL_CONFIRMADO } from '@/services/links/linksProfundos';
import { estaOnline } from '@/services/rede/conectividade';

const SEM_REDE = 'Precisas de internet para criar conta. Liga os dados móveis ou o Wi-Fi e tenta outra vez.';

export default function CriarConta() {
  const router = useRouter();
  const { utilizador } = useSessao();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [aCriar, setACriar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (utilizador && !aCriar) return <Redirect href="/" />;

  async function carregar() {
    setErro(null);
    if (!email.trim()) return setErro('Escreve o teu email.');
    if (password.length < 6) return setErro('A palavra-passe tem de ter pelo menos 6 caracteres.');
    if (password !== repetir) return setErro('As duas palavras-passe não são iguais.');
    setACriar(true);
    try {
      if (!(await estaOnline())) return setErro(SEM_REDE);
      const r = await criarConta(email, password, LINK_EMAIL_CONFIRMADO);
      if (r.precisaConfirmar) {
        router.replace({ pathname: '/verifica-email', params: { email: email.trim() } });
      }
      // Sem confirmação por email, a sessão abre logo e o "/" decide para onde ir.
    } catch (e) {
      if (e instanceof ErroAuth && eErroDeRede(e.original)) setErro(SEM_REDE);
      else setErro(e instanceof Error ? e.message : 'Não foi possível criar a conta.');
    } finally {
      setACriar(false);
    }
  }

  return (
    <Ecra>
      <Titulo>Criar conta</Titulo>
      <Texto>Usa um email a que tenhas acesso: vamos enviar-te uma mensagem para o confirmar.</Texto>
      <Campo
        rotulo="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        placeholder="nome@exemplo.ao"
      />
      <Campo
        rotulo="Palavra-passe (mínimo 6 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Campo
        rotulo="Repete a palavra-passe"
        value={repetir}
        onChangeText={setRepetir}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void carregar()}
      />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Criar conta" aCarregar={aCriar} onPress={() => void carregar()} />
      <Ligacao titulo="Já tenho conta: entrar" onPress={() => router.replace('/entrar')} />
    </Ecra>
  );
}
