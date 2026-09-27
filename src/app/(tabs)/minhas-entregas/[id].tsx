import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';

import { CamaraFachada } from '@/components/CamaraFachada';
import { dataHora } from '@/components/nomes';
import { Botao, Caixa, Cartao, Ecra, Linha, Subtitulo, Texto } from '@/components/ui';
import { linhasMarcaDeAgua } from '@/domain/enderecamento/registoMorada';
import { entregaTerminada, nomeEstadoEntrega } from '@/domain/entregas/envio';
import { estadoEfetivo, mensagemErroEstafeta, podeFechar, proximoPasso, type FicheiroProva } from '@/domain/entregas/estafeta';
import { recarregarEstafeta } from '@/hooks/useEntregasEstafeta';
import { reagendarTentativa } from '@/api/entregas';
import { useLocalProva } from '@/hooks/useLocalProva';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { acoesDaEntrega } from '@/services/entregas/estafeta';
import { servicoEstafeta } from '@/services/entregas/estafetaApp';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import { avisoAcao, definirAvisoEstafeta, useEstafeta } from '@/state/estafeta';

/** Detalhe de uma entrega do estafeta: destino, contacto, etapas e prova. */
export default function DetalheEntrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const estado = useEstafeta();
  const gps = useLocalProva();
  const [foto, setFoto] = useState<FicheiroProva | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrega = estado.entregas?.find((e) => e.id === id) ?? null;
  if (!entrega || !userId) {
    return (
      <Ecra>
        <Caixa tipo="info">Esta entrega já não está na lista.</Caixa>
        <Botao titulo="Voltar à lista" onPress={() => router.back()} />
      </Ecra>
    );
  }
  const acoes = acoesDaEntrega(entrega, estado.acoes);
  const efetivo = estadoEfetivo(entrega.estado, acoes);
  const passo = proximoPasso(efetivo);
  const m = entrega.morada;

  const reagendar = () => {
    Alert.alert('Reagendar tentativa', 'Esta entrega voltará a “Atribuída” para uma nova tentativa.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reagendar',
        onPress: () => void (async () => {
          setErro(null);
          setAEnviar(true);
          try {
            await reagendarTentativa(entrega.id);
            definirAvisoEstafeta(avisoAcao(online, 'Nova tentativa reagendada.'));
            await recarregarEstafeta(userId, online === true).catch(() => undefined);
          } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
          } finally {
            setAEnviar(false);
          }
        })(),
      },
    ]);
  };

  const fotografar = async (uriCamara: string) => {
    if (!gps.local) throw new Error('Espera pela posição do GPS.');
    const { latitude, longitude, plusCode } = gps.local;
    const pronta = await fotoComMarcaDeAgua(uriCamara, linhasMarcaDeAgua(plusCode, latitude, longitude, new Date()), 'recolha');
    setFoto(await servicoEstafeta.guardarFicheiro(pronta, 'image/jpeg'));
  };

  const avancar = async () => {
    if (!passo) return;
    setErro(null);
    setAEnviar(true);
    try {
      await servicoEstafeta.avancar(userId, entrega, passo, foto, gps.local);
      setFoto(null);
      definirAvisoEstafeta(avisoAcao(online, `"${passo.titulo}" registado.`));
      await recarregarEstafeta(userId, online === true).catch(() => undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <Ecra>
      {estado.aviso ? <Caixa tipo={estado.aviso.tipo}>{estado.aviso.texto}</Caixa> : null}
      <Cartao>
        <Linha nome="Para" valor={entrega.destinatario} />
        <Linha nome="Estado" valor={nomeEstadoEntrega(efetivo)} />
        {m?.referencia ? <Linha nome="Referência" valor={m.referencia} /> : null}
        {m?.codigoPostal || m?.plusCode ? <Linha nome="Destino" valor={[m.codigoPostal, m.plusCode].filter(Boolean).join(' · ')} /> : null}
        {entrega.instrucoes ? <Linha nome="Instruções" valor={entrega.instrucoes} /> : null}
        {entrega.codigo ? <Linha nome="Código de rastreio" valor={entrega.codigo} /> : null}
        <Linha nome="Prioridade" valor={entrega.urgente ? 'Urgente' : 'Normal'} />
        <Linha nome="Atualizado" valor={dataHora(entrega.atualizadoEm)} />
      </Cartao>
      {entrega.telefone ? (
        <Botao titulo={`Ligar a ${entrega.destinatario}`} variante="secundario" onPress={() => void Linking.openURL(`tel:${entrega.telefone!.replace(/\s/g, '')}`)} />
      ) : null}
      {typeof m?.latitude === 'number' && typeof m?.longitude === 'number' ? (
        <Botao
          titulo="Abrir o destino no mapa"
          variante="secundario"
          onPress={() => void Linking.openURL(`geo:${m.latitude},${m.longitude}?q=${m.latitude},${m.longitude}`)}
        />
      ) : null}

      {acoes.map((a, i) =>
        a.erro === null ? (
          <Caixa key={`${a.novo}-${i}`} tipo="info">{`À espera de rede: ${nomeEstadoEntrega(a.novo)}.`}</Caixa>
        ) : (
          <Caixa key={`${a.novo}-${i}`} tipo="erro">{`Recusado pelo servidor (${nomeEstadoEntrega(a.novo)}): ${mensagemErroEstafeta(a.erro)}`}</Caixa>
        ),
      )}

      {passo ? (
        <>
          <Subtitulo>{passo.titulo}</Subtitulo>
          {passo.precisaFoto ? (
            <>
              <Texto suave>Tira uma foto da encomenda recolhida (leva a marca de água com o local e a hora).</Texto>
              <CamaraFachada
                foto={foto?.uri ?? null}
                podeFotografar={gps.local !== null}
                motivoSemCamara={gps.texto}
                aoFotografar={fotografar}
                aoApagar={() => setFoto(null)}
                rotuloFoto="Foto da recolha"
              />
            </>
          ) : null}
          <Botao titulo={passo.titulo} onPress={() => void avancar()} desativado={passo.precisaFoto && !foto} aCarregar={aEnviar} />
        </>
      ) : null}

      {podeFechar(efetivo) ? (
        <>
          <Botao titulo="Entregar (prova de entrega)" onPress={() => router.push({ pathname: '/minhas-entregas/prova', params: { id: entrega.id } })} />
          <Botao
            titulo="Não foi possível entregar"
            variante="perigo"
            onPress={() => router.push({ pathname: '/minhas-entregas/falha', params: { id: entrega.id } })}
          />
        </>
      ) : null}

      {efetivo === 'FAILED' ? <Botao titulo="🔁 Reagendar tentativa" variante="secundario" onPress={reagendar} aCarregar={aEnviar} /> : null}
      {entregaTerminada(efetivo) ? <Texto suave>Esta entrega já terminou.</Texto> : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
    </Ecra>
  );
}
