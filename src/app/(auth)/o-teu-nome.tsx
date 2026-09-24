import { Redirect } from 'expo-router';
import { useState } from 'react';

import { eErroDeRede, ErroAuth, guardarNome } from '@/api/auth';
import { BotaoSair } from '@/components/BotaoSair';
import { Botao, Caixa, Campo, Ecra, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { erroNome } from '@/domain/identidade/nome';
import { useSessao } from '@/hooks/useSessao';
import { estaOnline } from '@/services/rede/conectividade';

const SEM_REDE = 'Precisas de internet para guardar o nome. Liga os dados móveis ou o Wi-Fi e tenta outra vez.';

/**
 * O nome completo é obrigatório. As contas criadas antes desta regra não o
 * têm: a app pede-o uma vez, antes de abrir o resto. Depois de guardado, a
 * sessão atualiza-se sozinha e a app segue para o mapa.
 */
export default function OTeuNome() {
  const { carregado, utilizador } = useSessao();
  const [nome, setNome] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!carregado) return <EcraCarregamento />;
  if (!utilizador) return <Redirect href="/entrar" />;
  if (utilizador.nome) return <Redirect href="/" />;

  async function guardar() {
    setErro(null);
    const problema = erroNome(nome);
    if (problema) return setErro(problema);
    setAGuardar(true);
    try {
      if (!(await estaOnline())) return setErro(SEM_REDE);
      await guardarNome(nome);
      // A sessão muda (USER_UPDATED) e o "/" segue para o mapa.
    } catch (e) {
      if (e instanceof ErroAuth && eErroDeRede(e.original)) setErro(SEM_REDE);
      else setErro(e instanceof Error ? e.message : 'Não foi possível guardar o nome.');
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Ecra>
      <Titulo>Como te chamas?</Titulo>
      <Texto>
        Escreve o teu nome completo, como está no BI. Aparece à equipa que confirma a tua identidade e nas tuas moradas.
      </Texto>
      <Campo
        rotulo="Nome completo"
        value={nome}
        onChangeText={setNome}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        placeholder="Ana Maria Silva"
        maxLength={80}
        onSubmitEditing={() => void guardar()}
      />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Guardar e continuar" aCarregar={aGuardar} onPress={() => void guardar()} />
      <BotaoSair />
    </Ecra>
  );
}
