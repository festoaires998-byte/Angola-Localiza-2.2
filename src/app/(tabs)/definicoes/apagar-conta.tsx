import { useState } from 'react';

import { Botao, Caixa, Campo, Ecra, Subtitulo, Texto, Titulo } from '@/components/ui';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { PALAVRA_CONFIRMACAO } from '@/services/conta/palavra';
import { apagarConta } from '@/services/conta/apagarContaApp';

/** Definições → Apagar a minha conta (exigido pela Google Play e pela App Store). */
export default function ApagarConta() {
  const userId = useSessao().utilizador?.id ?? null;
  const online = useOnline();
  const [texto, setTexto] = useState('');
  const [aApagar, setAApagar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const confirmado = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO;

  async function apagar() {
    if (!userId || !confirmado) return;
    setErro(null);
    setAApagar(true);
    const r = await apagarConta(userId, texto);
    setAApagar(false);
    if (!r.ok) setErro(r.erro);
    // Com sucesso, a sessão termina e a app volta sozinha ao ecrã de entrada.
  }

  return (
    <Ecra>
      <Titulo>Apagar a minha conta</Titulo>
      <Caixa tipo="aviso">Isto não tem volta atrás. Depois de apagada, não consegues voltar a entrar com esta conta.</Caixa>

      <Subtitulo>O que é apagado</Subtitulo>
      <Texto>• O teu nome, email e telefone.</Texto>
      <Texto>• As fotos do BI, a selfie, o vídeo e os documentos de motorista.</Texto>
      <Texto>• Os teus favoritos, notificações e moradas privadas.</Texto>
      <Texto>• Os anexos que enviaste no chat.</Texto>
      <Texto>• O que está neste telemóvel à espera de ser enviado.</Texto>

      <Subtitulo>O que fica, sem o teu nome</Subtitulo>
      <Texto>• As entregas e as provas de entrega (para reclamações e contas).</Texto>
      <Texto>• As moradas públicas já validadas, que continuam no mapa.</Texto>

      {online === false ? <Caixa tipo="info">Para apagar a conta precisas de rede.</Caixa> : null}
      <Campo
        rotulo={`Para confirmar, escreve ${PALAVRA_CONFIRMACAO}`}
        value={texto}
        onChangeText={setTexto}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao
        titulo="Apagar a minha conta"
        variante="perigo"
        onPress={() => void apagar()}
        desativado={!confirmado || aApagar || online === false || !userId}
        aCarregar={aApagar}
      />
    </Ecra>
  );
}
