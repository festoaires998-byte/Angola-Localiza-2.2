import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';

import { criarConta, eErroDeRede, ErroAuth } from '@/api/auth';
import { Botao, Caixa, Campo, Ecra, Ligacao, Texto, Titulo } from '@/components/ui';
import { PAISES_PALOP, type CodigoPais } from '@/config/pais';
import { erroNome } from '@/domain/identidade/nome';
import { useSessao } from '@/hooks/useSessao';
import { LINK_EMAIL_CONFIRMADO } from '@/services/links/linksProfundos';
import { estaOnline } from '@/services/rede/conectividade';

const SEM_REDE = 'Precisas de internet para criar conta. Liga os dados móveis ou o Wi-Fi e tenta outra vez.';

export default function CriarConta() {
  const router = useRouter();
  const { utilizador } = useSessao();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');