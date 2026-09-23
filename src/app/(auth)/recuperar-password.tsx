import { useRouter } from 'expo-router';
import { useState } from 'react';

import { eErroDeRede, ErroAuth, recuperarPassword } from '@/api/auth';
import { Botao, Caixa, Campo, Ecra, Ligacao, Texto, Titulo } from '@/components/ui';
import { LINK_NOVA_PASSWORD } from '@/services/links/linksProfundos';
import { estaOnline } from '@/services/rede/conectividade';

const SEM_REDE = 'Precisas de internet para pedir o link. Liga os dados móveis ou o Wi-Fi e tenta outra vez.';

export default function RecuperarPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    if (!email.trim()) return setErro('Escreve o teu email.');
    setAEnviar(true);
    try {
      if (!(await estaOnline())) return setErro(SEM_REDE);
      await recuperarPassword(email, LINK_NOVA_PASSWORD);
      setEnviado(true);
    } catch (e) {
      if (e instanceof ErroAuth && eErroDeRede(e.original)) setErro(SEM_REDE);
      else setErro(e instanceof Error ? e.message : 'Não foi possível enviar o link.');
    } finally {
      setAEnviar(false);
    }
  }

  if (enviado) {
    return (
      <Ecra centrado>
        <Titulo>Verifica o teu email</Titulo>
        <Texto>
          Se existir uma conta com {email.trim()}, vais receber uma mensagem com um link. Abre-a neste
          telemóvel e carrega no link para escolheres uma palavra-passe nova.
        </Texto>
        <Caixa tipo="info">Não chegou? Espera alguns minutos e procura também na pasta de Spam ou Lixo.</Caixa>
        <Botao titulo="Voltar a entrar" onPress={() => router.replace('/entrar')} />
      </Ecra>
    );
  }

  return (
    <Ecra>
      <Titulo>Esqueci-me da palavra-passe</Titulo>
      <Texto>Escreve o email da tua conta. Vamos enviar-te um link para escolheres uma palavra-passe nova.</Texto>
      <Campo
        rotulo="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        placeholder="nome@exemplo.ao"
        onSubmitEditing={() => void carregar()}
      />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Enviar link" aCarregar={aEnviar} onPress={() => void carregar()} />
      <Ligacao titulo="Voltar" onPress={() => router.replace('/entrar')} />
    </Ecra>
  );
}
