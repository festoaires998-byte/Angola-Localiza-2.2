import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';

import { Botao, Caixa, Ecra, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { useLinkAuth } from '@/hooks/useLinkAuth';
import { useSessao } from '@/hooks/useSessao';
import { lerLinkAuth } from '@/services/links/linksProfundos';

/** Aberto pelo link do email de confirmação da conta (angolalocaliza://email-confirmado). */
export default function EmailConfirmado() {
  const router = useRouter();
  const url = useLinkingURL();
  const link = useLinkAuth();
  const { carregado, utilizador } = useSessao();

  const linkPorAbrir = !!url && lerLinkAuth(url) !== null && link.estado === 'nenhum';
  if (!carregado || link.estado === 'a_abrir' || (!utilizador && linkPorAbrir)) {
    return <EcraCarregamento texto="A confirmar o email…" />;
  }

  if (!utilizador) {
    return (
      <Ecra centrado>
        <Titulo>Link sem efeito</Titulo>
        <Caixa tipo="erro">
          {link.estado === 'erro' ? link.mensagem : 'Este link expirou ou já foi usado.'}
        </Caixa>
        <Texto>Se já confirmaste o email antes, podes entrar normalmente.</Texto>
        <Botao titulo="Entrar" onPress={() => router.replace('/entrar')} />
      </Ecra>
    );
  }

  return (
    <Ecra centrado>
      <Titulo>Email confirmado</Titulo>
      <Caixa tipo="sucesso">A tua conta está pronta a usar.</Caixa>
      <Botao titulo="Continuar" onPress={() => router.replace('/')} />
    </Ecra>
  );
}
