import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { definirNovaPassword, ErroAuth } from '@/api/auth';
import { Botao, Caixa, Campo, Ecra, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { useLinkAuth } from '@/hooks/useLinkAuth';
import { useSessao } from '@/hooks/useSessao';
import { lerLinkAuth } from '@/services/links/linksProfundos';

/** Aberto pelo link do email "Recuperar palavra-passe" (angolalocaliza://nova-password). */
export default function NovaPassword() {
  const router = useRouter();
  const url = useLinkingURL();
  const link = useLinkAuth();
  const { carregado, utilizador } = useSessao();
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [faltaCodigo, setFaltaCodigo] = useState(false);
  const [feito, setFeito] = useState(false);

  const linkPorAbrir = !!url && lerLinkAuth(url) !== null && link.estado === 'nenhum';
  if (!carregado || link.estado === 'a_abrir' || (!utilizador && linkPorAbrir)) {
    return <EcraCarregamento texto="A abrir o link…" />;
  }

  if (!utilizador) {
    return (
      <Ecra centrado>
        <Titulo>Link sem efeito</Titulo>
        <Caixa tipo="erro">
          {link.estado === 'erro' ? link.mensagem : 'Este link expirou ou já foi usado. Pede um novo.'}
        </Caixa>
        <Botao titulo="Pedir um link novo" onPress={() => router.replace('/recuperar-password')} />
        <Botao titulo="Voltar a entrar" variante="secundario" onPress={() => router.replace('/entrar')} />
      </Ecra>
    );
  }

  if (feito) {
    return (
      <Ecra centrado>
        <Titulo>Palavra-passe mudada</Titulo>
        <Caixa tipo="sucesso">A partir de agora, entra com a palavra-passe nova.</Caixa>
        <Botao titulo="Continuar" onPress={() => router.replace('/')} />
      </Ecra>
    );
  }

  async function guardar() {
    setErro(null);
    setFaltaCodigo(false);
    if (password.length < 6) return setErro('A palavra-passe tem de ter pelo menos 6 caracteres.');
    if (password !== repetir) return setErro('As duas palavras-passe não são iguais.');
    setAGuardar(true);
    try {
      await definirNovaPassword(password);
      setFeito(true);
    } catch (e) {
      // Contas com código de segurança (MFA) têm de o confirmar antes de mudar a palavra-passe.
      if (e instanceof ErroAuth && /aal2/i.test(e.original)) {
        setFaltaCodigo(true);
        setErro('Antes de mudares a palavra-passe, escreve o código da tua app de autenticação.');
      } else {
        setErro(e instanceof Error ? e.message : 'Não foi possível mudar a palavra-passe.');
      }
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Ecra>
      <Titulo>Nova palavra-passe</Titulo>
      <Texto>Escolhe uma palavra-passe nova para {utilizador.email ?? 'a tua conta'}.</Texto>
      <Campo
        rotulo="Palavra-passe nova (mínimo 6 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Campo
        rotulo="Repete a palavra-passe nova"
        value={repetir}
        onChangeText={setRepetir}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void guardar()}
      />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      {faltaCodigo ? (
        <Botao
          titulo="Escrever o código"
          onPress={() => router.push({ pathname: '/codigo-mfa', params: { depois: 'nova-password' } })}
        />
      ) : null}
      <Botao titulo="Guardar palavra-passe" aCarregar={aGuardar} onPress={() => void guardar()} />
    </Ecra>
  );
}
