import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { Opcoes, type Opcao } from '@/components/Opcoes';
import { LeitorQr } from '@/components/mapa/LeitorQr';
import { Botao, Caixa, Campo, Ecra, EcraCarregamento, Subtitulo, Texto } from '@/components/ui';
import { faltaNoEnvio, MAX_INSTRUCOES, mensagemErroEnvio, type DadosEnvio } from '@/domain/entregas/envio';
import { interpretarEntrada } from '@/domain/enderecamento/pesquisa';
import { useMoradas } from '@/hooks/useMoradas';
import { useOnline } from '@/hooks/useOnline';
import { usePosicao } from '@/hooks/usePosicao';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useSessao } from '@/hooks/useSessao';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { tituloMorada } from '@/services/moradas/moradas';
import { podeRegistar, type Verificacao } from '@/services/moradas/registo';
import { servicoRegisto } from '@/services/moradas/registoApp';
import { AVISO_NA_FILA, definirAvisoEnvios, guardarEnvio } from '@/state/envios';

const PRIORIDADES: readonly Opcao<'normal' | 'urgente'>[] = [
  { valor: 'normal', nome: 'Normal' },
  { valor: 'urgente', nome: 'Urgente' },
];

/** Novo pedido de entrega: morada de destino (das guardadas), quem recebe e instruções. */
export default function NovoEnvio() {
  const online = useOnline();
  const sessao = useSessao();
  const userId = sessao.utilizador?.id ?? null;
  const countryCode = sessao.utilizador?.countryCode ?? 'AO';
  const router = useRouter();
  const moradas = useMoradas(online);
  const estadoPosicao = usePosicao();
  const posicao = estadoPosicao.estado === 'ok' ? estadoPosicao.posicao : estadoPosicao.estado === 'a_procurar' ? estadoPosicao.ultima : null;
  const infoOrigem = useInfoLocal(posicao ? { latitude: posicao.latitude, longitude: posicao.longitude } : null, online === true, posicao?.precisao === null || posicao?.precisao === undefined ? false : posicao.precisao <= 10);
  const [verificacao, setVerificacao] = useState<Verificacao | null>(null);
  const [dados, setDados] = useState<DadosEnvio>({ moradaId: null, destinatario: '', telefone: '', instrucoes: '', urgente: false, countryCode });
  const [modoOrigem, setModoOrigem] = useState<'gps' | 'guardado'>('gps');
  const [origemGuardadaId, setOrigemGuardadaId] = useState<string | null>(null);

  useEffect(() => {
    if (modoOrigem !== 'gps' || !posicao) return;
    setDados((d) => ({
      ...d,
      origem: {
        latitude: posicao.latitude,
        longitude: posicao.longitude,
        codigoPostal: infoOrigem?.codigoPostal.codigo ?? null,
        plusCode: infoOrigem?.plusCode ?? null,
      },
    }));
  }, [modoOrigem, posicao?.latitude, posicao?.longitude, infoOrigem?.codigoPostal.codigo, infoOrigem?.plusCode]);
  const [aEnviar, setAEnviar] = useState(false);
  const [entradaDestino, setEntradaDestino] = useState('');
  const [lerQr, setLerQr] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    servicoRegisto
      .verificacao(userId, online === true)
      .then((v) => ativo && setVerificacao(v))
      .catch(() => ativo && setVerificacao('desconhecido'));
    return () => {
      ativo = false;
    };
  }, [userId, online]);

  // Só moradas que já existem no servidor (têm id lá).
  const origensGuardadas = useMemo<Opcao<string>[]>(
    () => (moradas.itens ?? [])
      .filter((i) => i.morada && i.favorito.pendente !== 'remover')
      .map((i) => ({ valor: i.morada!.id, nome: tituloMorada(i), detalhe: i.morada!.codigo_postal ?? i.morada!.plus_code ?? undefined })),
    [moradas.itens],
  );

  const destinos = useMemo<Opcao<string>[]>(
    () =>
      (moradas.itens ?? [])
        .filter((i) => i.morada && i.morada.origem !== 'local' && i.favorito.pendente !== 'remover')
        .map((i) => ({
          valor: i.morada!.id,
          nome: tituloMorada(i),
          detalhe: i.morada!.codigo_postal ?? i.morada!.plus_code ?? undefined,
        })),
    [moradas.itens],
  );

  if (verificacao === null || moradas.itens === null) return <EcraCarregamento texto="A preparar o envio…" />;

  if (!podeRegistar(verificacao)) {
    return (
      <Ecra>
        <Caixa tipo="aviso">
          {verificacao === 'em_revisao' || verificacao === 'pendente'
            ? 'A tua verificação da identidade está à espera de um administrador. Só depois de aprovada podes enviar.'
            : 'Para enviar, primeiro tens de verificar a tua identidade.'}
        </Caixa>
        <Botao titulo="Verificar a minha identidade" onPress={() => router.push('/definicoes/verificacao')} />
      </Ecra>
    );
  }

  const falta = faltaNoEnvio(dados);
  const selecionarPorEntrada = (entrada: string) => {
    const referencia = posicao ? { latitude: posicao.latitude, longitude: posicao.longitude } : undefined;
    const r = interpretarEntrada(entrada, referencia);
    if (r.tipo !== 'ponto') {
      setErro(r.tipo === 'invalida' ? r.motivo : 'Este QR/link precisa de uma localização válida.');
      return false;
    }
    const encontrado = (moradas.itens ?? []).find((i) => {
      const m = i.morada;
      if (!m || m.origem === 'local' || i.favorito.pendente === 'remover') return false;
      if (r.tipo === 'ponto' && m.latitude !== null && m.longitude !== null) {
        return Math.abs(m.latitude - r.latitude) < 0.00015 && Math.abs(m.longitude - r.longitude) < 0.00015;
      }
      return false;
    });
    if (!encontrado?.morada?.id) {
      setErro('A localização foi lida, mas ainda não existe nas tuas Moradas. Guarda primeiro este ponto como morada de destino.');
      return false;
    }
    mudar({ moradaId: encontrado.morada.id });
    setEntradaDestino('');
    setLerQr(false);
    setErro(null);
    return true;
  };

  const mudar = (m: Partial<DadosEnvio>) => setDados((d) => ({ ...d, ...m }));

  function pedirConfirmacao() {
    setErro(null);
    if (falta.length > 0) return;
    setConfirmar(true);
  }

  async function enviar() {
    if (!userId) return;
    setErro(null);
    setAEnviar(true);
    try {
      const r = await servicoEnvios.enviar(userId, dados, online === true);
      if (r.tipo === 'enviado') {
        guardarEnvio(r.envio, r.pin, { tipo: 'sucesso', texto: 'Pedido enviado. Dá o PIN só a quem vai receber a encomenda.' });
        router.replace({ pathname: '/entrega/[id]', params: { id: r.envio.id } });
      } else {
        definirAvisoEnvios({ tipo: 'info', texto: AVISO_NA_FILA });
        router.back();
      }
    } catch (e) {
      setErro(mensagemErroEnvio(e instanceof Error ? e.message : String(e)));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <Ecra>
      {verificacao === 'desconhecido' ? (
        <Caixa tipo="info">Sem rede não foi possível confirmar a tua verificação. O servidor confirma ao receber.</Caixa>
      ) : null}

      <Subtitulo>De onde?</Subtitulo>
      <Opcoes grupo="Local de recolha" opcoes={[
        { valor: 'gps', nome: '📍 Minha localização' },
        ...(origensGuardadas.length > 0 ? [{ valor: 'guardado', nome: '⭐ Guardados' }] : []),
      ]} valor={modoOrigem} aoEscolher={(v) => {
        const modo = v as 'gps' | 'guardado';
        setModoOrigem(modo);
        if (modo === 'gps') {
          setOrigemGuardadaId(null);
          mudar({ origem: undefined });
          return;
        }
        const primeiro = origensGuardadas[0]?.valor;
        const item = primeiro ? (moradas.itens ?? []).find((i) => i.morada?.id === primeiro) : undefined;
        if (!item?.morada || !Number.isFinite(item.morada.latitude) || !Number.isFinite(item.morada.longitude)) {
          setOrigemGuardadaId(null);
          mudar({ origem: undefined });
          return;
        }
        setOrigemGuardadaId(primeiro ?? null);
        mudar({ origem: { latitude: item.morada.latitude, longitude: item.morada.longitude, codigoPostal: item.morada.codigo_postal, plusCode: item.morada.plus_code } });
      }} />
      {modoOrigem === 'guardado' ? (
        <Opcoes grupo="Morada guardada para recolha" empilhadas opcoes={origensGuardadas}
          valor={origemGuardadaId}
          aoEscolher={(id) => {
            const item = (moradas.itens ?? []).find((i) => i.morada?.id === id);
            if (!item?.morada || !Number.isFinite(item.morada.latitude) || !Number.isFinite(item.morada.longitude)) return;
            setOrigemGuardadaId(id);
            mudar({ origem: { latitude: item.morada.latitude, longitude: item.morada.longitude, codigoPostal: item.morada.codigo_postal, plusCode: item.morada.plus_code } });
          }} />
      ) : posicao ? (
        <Caixa tipo="info">
          {'Origem: ' + (infoOrigem?.codigoPostal.codigo ?? infoOrigem?.plusCode ?? 'posição atual') + (infoOrigem?.local.municipio ? ' · ' + infoOrigem.local.municipio : '')}
          {posicao.precisao !== null && posicao.precisao > 10 ? '\nA posição está pouco precisa; continua a medir antes de enviar.' : ''}
        </Caixa>
      ) : estadoPosicao.estado === 'sem_permissao' ? (
        <Caixa tipo="aviso">Autoriza a localização para registar o ponto de origem do envio.</Caixa>
      ) : estadoPosicao.estado === 'gps_desligado' ? (
        <Caixa tipo="aviso">Liga a localização do telemóvel para registar o ponto de origem do envio.</Caixa>
      ) : (
        <Caixa tipo="info">A obter a localização atual…</Caixa>
      )}
      <Subtitulo>Para onde?</Subtitulo>
      {destinos.length > 0 ? (
        <Opcoes grupo="Morada de destino" empilhadas opcoes={destinos} valor={dados.moradaId} aoEscolher={(v) => mudar({ moradaId: v })} />
      ) : null}

      <Campo
        rotulo="Código, Plus Code ou link do destino"
        value={entradaDestino}
        onChangeText={setEntradaDestino}
        autoCapitalize="characters"
        placeholder="Ex.: 6FJ4MQ66+2V ou link do mapa"
      />
      <Botao
        titulo="Usar código/link"
        variante="secundario"
        onPress={() => selecionarPorEntrada(entradaDestino)}
        desativado={!entradaDestino.trim()}
      />
      <Botao titulo="Ler QR do destino" variante="secundario" onPress={() => { setErro(null); setLerQr(true); }} />

      {lerQr ? (
        <LeitorQr
          aoLer={(conteudo) => selecionarPorEntrada(conteudo)}
          aoFechar={() => setLerQr(false)}
        />
      ) : null}

      {destinos.length === 0 ? (
        <>
          <Caixa tipo="info">
            Ainda não tens moradas guardadas. Guarda primeiro a morada de destino no separador Moradas.
          </Caixa>
          <Botao titulo="Abrir as Moradas" variante="secundario" onPress={() => router.push('/guardados')} />
        </>
      ) : null}

      <Subtitulo>Quem vai receber?</Subtitulo>
      <Campo
        rotulo="Nome de quem recebe"
        value={dados.destinatario}
        onChangeText={(t) => mudar({ destinatario: t })}
        autoCapitalize="words"
        placeholder="Ex.: Maria João"
      />
      <Campo
        rotulo="Telefone de quem recebe (opcional)"
        value={dados.telefone}
        onChangeText={(t) => mudar({ telefone: t })}
        keyboardType="phone-pad"
        placeholder="Ex.: 923 456 789"
      />
      <Campo
        rotulo={`Instruções para o estafeta (opcional, até ${MAX_INSTRUCOES} letras)`}
        value={dados.instrucoes}
        onChangeText={(t) => mudar({ instrucoes: t })}
        multiline
        placeholder="Ex.: Portão verde, tocar à campainha."
      />

      <Subtitulo>Prioridade</Subtitulo>
      <Opcoes grupo="Prioridade" opcoes={PRIORIDADES} valor={dados.urgente ? 'urgente' : 'normal'} aoEscolher={(v) => mudar({ urgente: v === 'urgente' })} />

      {falta.length > 0 ? (
        <Caixa tipo="aviso">{`Falta:\n${falta.map((f) => `• ${f}`).join('\n')}`}</Caixa>
      ) : null}
      {online === false ? (
        <Texto suave>Sem rede: o pedido fica guardado neste telemóvel e é enviado quando a rede voltar.</Texto>
      ) : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}

      {!confirmar ? (
        <Botao titulo="Rever e confirmar pedido" onPress={pedirConfirmacao} desativado={falta.length > 0} />
      ) : (
        <>
          <Caixa tipo="info">
            {[
              'Confirma os dados antes de enviar:',
              `Origem: ${dados.origem?.codigoPostal ?? dados.origem?.plusCode ?? 'posição atual'}`,
              `Destino: ${destinos.find((d) => d.valor === dados.moradaId)?.nome ?? 'morada selecionada'}`,
              `Destinatário: ${dados.destinatario}`,
              dados.telefone.trim() ? `Telefone: ${dados.telefone.trim()}` : 'Telefone: não indicado',
              dados.instrucoes.trim() ? `Instruções: ${dados.instrucoes.trim()}` : 'Instruções: não indicadas',
              `Prioridade: ${dados.urgente ? 'Urgente' : 'Normal'}`,
            ].join('\\n')}
          </Caixa>
          {online === false ? (
            <Caixa tipo="aviso">Sem rede: ao confirmar, o pedido será guardado neste telemóvel para envio posterior.</Caixa>
          ) : null}
          <Botao titulo="Confirmar e enviar" onPress={() => void enviar()} desativado={aEnviar} aCarregar={aEnviar} />
          <Botao titulo="Voltar e editar" variante="secundario" onPress={() => setConfirmar(false)} desativado={aEnviar} />
        </>
      )}
    </Ecra>
  );
}
