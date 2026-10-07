import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AssinaturaDedo } from '@/components/AssinaturaDedo';
import { CamaraFachada } from '@/components/CamaraFachada';
import { Opcoes } from '@/components/Opcoes';
import { Botao, CabecalhoCartao, Caixa, Campo, Ecra, Subtitulo, Texto } from '@/components/ui';
import { linhasMarcaDeAgua } from '@/domain/enderecamento/registoMorada';
import { faltaNaPod, type DadosPod, type FicheiroProva } from '@/domain/entregas/estafeta';
import { recarregarEstafeta } from '@/hooks/useEntregasEstafeta';
import { useLocalProva } from '@/hooks/useLocalProva';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { servicoEstafeta } from '@/services/entregas/estafetaApp';
import { gravarAssinaturaPng } from '@/services/imagem/assinaturaPng';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import { avisoAcao, definirAvisoEstafeta, useEstafeta } from '@/state/estafeta';

const SIM_NAO = [
  { valor: 'nao', nome: 'Não' },
  { valor: 'sim', nome: 'Sim' },
] as const;

/**
 * Prova de entrega (POD): foto com marca de água, assinatura de quem recebe
 * (com o dedo) e o PIN que quem recebe dá. Funciona sem rede: fica tudo no
 * telemóvel, assinado pela chave do aparelho, e sobe quando a rede voltar.
 */
export default function ProvaEntrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const entrega = useEstafeta().entregas?.find((e) => e.id === id) ?? null;
  const gps = useLocalProva();
  const [foto, setFoto] = useState<FicheiroProva | null>(null);
  const [assinatura, setAssinatura] = useState<FicheiroProva | null>(null);
  const [pin, setPin] = useState('');
  const [observacao, setObservacao] = useState('');
  const [volumoso, setVolumoso] = useState(false);
  const [esperaLonga, setEsperaLonga] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!entrega || !userId) {
    return (
      <Ecra>
        <Caixa tipo="info">Esta entrega já não está na lista.</Caixa>
        <Botao titulo="Voltar" onPress={() => router.back()} />
      </Ecra>
    );
  }

  const dados: DadosPod = { pin, foto, assinatura, local: gps.local, observacao, volumoso, esperaLonga };
  const falta = faltaNaPod(dados);

  const fotografar = async (uriCamara: string) => {
    if (!gps.local) throw new Error('Espera pela posição do GPS.');
    const { latitude, longitude, plusCode } = gps.local;
    const pronta = await fotoComMarcaDeAgua(uriCamara, linhasMarcaDeAgua(plusCode, latitude, longitude, new Date()), 'entrega');
    setFoto(await servicoEstafeta.guardarFicheiro(pronta, 'image/jpeg'));
  };

  const confirmar = async () => {
    setErro(null);
    setAEnviar(true);
    try {
      const r = await servicoEstafeta.fechar(userId, entrega, dados);
      definirAvisoEstafeta(
        avisoAcao(
          online,
          r.assinadaPeloAparelho ? 'Prova de entrega guardada e assinada por este telemóvel.' : 'Prova de entrega guardada (sem a assinatura do telemóvel).',
        ),
      );
      await recarregarEstafeta(userId, online === true).catch(() => undefined);
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <Ecra>
      <Texto>{`Entrega para ${entrega.destinatario}`}</Texto>
      <Caixa tipo={gps.local ? (gps.fraca ? 'aviso' : 'info') : 'aviso'}>{gps.texto}</Caixa>

      <CabecalhoCartao titulo="1. Foto da entrega" icone="camara" cor="azul" />
      <Texto suave>Fotografa a encomenda entregue (leva a marca de água com o local e a hora).</Texto>
      <CamaraFachada
        foto={foto?.uri ?? null}
        podeFotografar={gps.local !== null}
        motivoSemCamara={gps.texto}
        aoFotografar={fotografar}
        aoApagar={() => setFoto(null)}
        rotuloFoto="Foto da entrega"
      />

      <CabecalhoCartao titulo="2. Assinatura de quem recebe" icone="assinatura" cor="roxo" />
      <AssinaturaDedo
        assinatura={assinatura?.uri ?? null}
        aoConfirmar={async (tracos, largura, altura) => {
          setAssinatura(await servicoEstafeta.guardarFicheiro(gravarAssinaturaPng(tracos, largura, altura), 'image/png'));
        }}
        aoApagar={() => setAssinatura(null)}
      />

      <CabecalhoCartao titulo="3. PIN de quem recebe" icone="pin" cor="verde" />
      <Campo
        rotulo="PIN (4 algarismos)"
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
      />
      <Texto suave>Quem recebe diz-te o PIN. O servidor confere-o: 5 PINs errados bloqueiam a entrega.</Texto>

      <Subtitulo>Extras</Subtitulo>
      <Opcoes grupo="Encomenda volumosa" opcoes={SIM_NAO} valor={volumoso ? 'sim' : 'nao'} aoEscolher={(v) => setVolumoso(v === 'sim')} />
      <Texto suave>Encomenda volumosa?</Texto>
      <Opcoes grupo="Espera longa" opcoes={SIM_NAO} valor={esperaLonga ? 'sim' : 'nao'} aoEscolher={(v) => setEsperaLonga(v === 'sim')} />
      <Texto suave>Esperaste muito tempo por quem recebe?</Texto>
      <Campo rotulo="Observação (opcional)" value={observacao} onChangeText={setObservacao} multiline />

      {falta.length > 0 ? <Caixa tipo="aviso">{`Falta:\n${falta.map((f) => `• ${f}`).join('\n')}`}</Caixa> : null}
      {online === false ? <Texto suave>Sem rede: a prova fica guardada neste telemóvel e é enviada quando a rede voltar.</Texto> : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Confirmar a entrega" onPress={() => void confirmar()} desativado={falta.length > 0} aCarregar={aEnviar} />
    </Ecra>
  );
}
