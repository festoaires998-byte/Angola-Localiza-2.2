import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { CamaraFachada } from '@/components/CamaraFachada';
import { Opcoes } from '@/components/Opcoes';
import { Botao, CabecalhoCartao, Caixa, Campo, Ecra, Texto } from '@/components/ui';
import { linhasMarcaDeAgua } from '@/domain/enderecamento/registoMorada';
import { MOTIVOS_FALHA, type FicheiroProva, type MotivoFalha } from '@/domain/entregas/estafeta';
import { recarregarEstafeta } from '@/hooks/useEntregasEstafeta';
import { useLocalProva } from '@/hooks/useLocalProva';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { servicoEstafeta } from '@/services/entregas/estafetaApp';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import { avisoAcao, definirAvisoEstafeta, useEstafeta } from '@/state/estafeta';

/** "Não foi possível entregar": motivo obrigatório, foto opcional. */
export default function FalhaEntrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const entrega = useEstafeta().entregas?.find((e) => e.id === id) ?? null;
  const gps = useLocalProva();
  const [motivo, setMotivo] = useState<MotivoFalha | null>(null);
  const [observacao, setObservacao] = useState('');
  const [foto, setFoto] = useState<FicheiroProva | null>(null);
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

  const fotografar = async (uriCamara: string) => {
    if (!gps.local) throw new Error('Espera pela posição do GPS.');
    const { latitude, longitude, plusCode } = gps.local;
    const pronta = await fotoComMarcaDeAgua(uriCamara, linhasMarcaDeAgua(plusCode, latitude, longitude, new Date()), 'falha');
    setFoto(await servicoEstafeta.guardarFicheiro(pronta, 'image/jpeg'));
  };

  const confirmar = async () => {
    if (!motivo) return;
    setErro(null);
    setAEnviar(true);
    try {
      await servicoEstafeta.falhar(userId, entrega, motivo, observacao, foto, gps.local);
      definirAvisoEstafeta(avisoAcao(online, 'Registado: não foi possível entregar.'));
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
      <CabecalhoCartao titulo="Porque não foi possível?" icone="atencao" cor="vermelho" />
      <Opcoes grupo="Motivo" empilhadas opcoes={MOTIVOS_FALHA} valor={motivo} aoEscolher={(v) => setMotivo(v as MotivoFalha)} />
      <Campo rotulo="Observação (opcional)" value={observacao} onChangeText={setObservacao} multiline />
      <CabecalhoCartao titulo="Foto (opcional)" icone="camara" cor="azul" />
      <CamaraFachada
        foto={foto?.uri ?? null}
        podeFotografar={gps.local !== null}
        motivoSemCamara={gps.texto}
        aoFotografar={fotografar}
        aoApagar={() => setFoto(null)}
        rotuloFoto="Foto do local"
      />
      {!motivo ? <Caixa tipo="aviso">Falta: • Escolher o motivo.</Caixa> : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao titulo="Registar que não foi possível" variante="perigo" onPress={() => void confirmar()} desativado={!motivo} aCarregar={aEnviar} />
    </Ecra>
  );
}
