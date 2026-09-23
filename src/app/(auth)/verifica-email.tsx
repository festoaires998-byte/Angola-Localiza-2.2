import { useLocalSearchParams, useRouter } from 'expo-router';

import { Botao, Caixa, Ecra, Texto, Titulo } from '@/components/ui';

export default function VerificaEmail() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  return (
    <Ecra centrado>
      <Titulo>Verifica o teu email</Titulo>
      <Texto>
        Enviámos uma mensagem para {email || 'o teu email'}. Abre essa mensagem neste telemóvel e
        carrega no link para confirmar a conta.
      </Texto>
      <Texto>O link abre a app Angola Localiza e a tua conta fica pronta a usar.</Texto>
      <Caixa tipo="info">
        Não encontras a mensagem? Espera alguns minutos e procura também na pasta de Spam ou Lixo.
      </Caixa>
      <Botao titulo="Já confirmei: entrar" onPress={() => router.replace('/entrar')} />
    </Ecra>
  );
}
