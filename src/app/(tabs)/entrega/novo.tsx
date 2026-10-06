import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { Opcoes, type Opcao } from '@/components/Opcoes';
import { LeitorQr } from '@/components/mapa/LeitorQr';
import { Botao, CabecalhoCartao, Caixa, Campo, Ecra, EcraCarregamento, Texto } from '@/components/ui';
import { faltaNoEnvio, MAX_INSTRUCOES, mensagemErroEnvio, type DadosEnvio } from '@/domain/entregas/envio';
import { interpretarEntrada } from '@/domain/enderecamento/pesquisa';
import { encode } from '@/domain/enderecamento/plusCode';
import { pesquisarNoServidor } from '@/api/pesquisa';
import { useMoradas } from '@/hooks/useMoradas';
import { useOnline } from '@/hooks/useOnline';
import { usePosicao } from '@/hooks/usePosicao';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useSessao } from '@/hooks/useSessao';
import { cotarEntrega, textoCotacao, type CotacaoEntrega } from '@/api/pricing';
import { resolverDestino } from '@/services/entregas/destino';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { tituloMorada } from '@/services/moradas/moradas';
import { mudancasMoradas, servicoMoradas } from '@/services/moradas/moradasApp';
import { podeRegistar, type Verificacao } from '@/services/moradas/registo';
import { servicoRegisto } from '@/services/moradas/registoApp';
import { AVISO_DESTINO_NOVO, AVISO_NA_FILA, definirAvisoEnvios, guardarEnvio } from '@/state/envios';

const PRIORIDADES: readonly Opcao<'normal' | 'urgente'>[] = [
  { valor: 'normal', nome: 'Normal' },
  { valor: 'urgente', nome: 'Urgente' },
];

/**
 * Novo pedido de entrega: morada de destino (das guardadas, ou por Plus Code,
 * link, QR ou código postal), quem recebe e instruções.
 */
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
  const [modoOrigem, setModoOrigem] = useState<'gps' | 'guardado' | 'codigo' | 'qr'>('gps');
  const [entradaOrigem, setEntradaOrigem] = useState('');
  const [lerQrOrigem, setLerQrOrigem] = useState(false);
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
  /** Destino criado agora no telemóvel (ainda pode não estar no servidor). */
  const [destinoNovo, setDestinoNovo] = useState<{ moradaId: string; texto: string } | null>(null);
  const [aProcurarDestino, setAProcurarDestino] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [cotacao, setCotacao] = useState<CotacaoEntrega | null>(null);
  const [cotacaoErro, setCotacaoErro] = useState<string | null>(null);
  const [carga, setCarga] = useState({ tipo:'Encomenda', descricao:'', quantidade:'', pesoKg:'', comprimentoCm:'', larguraCm:'', alturaCm:'', valorDeclarado:'', tipoVeiculo:'', capacidadeVeiculoKg:'' });
  const destinoSelecionado = useMemo(() => (moradas.itens ?? []).find((i) => i.morada?.id === dados.moradaId)?.morada ?? null, [moradas.itens, dados.moradaId]);

  useEffect(() => {
    if (!online || !dados.origem || destinoSelecionado?.latitude == null || destinoSelecionado?.longitude == null) {
      setCotacao(null);
      setCotacaoErro(null);
      return;
    }
    let ativo = true;
    setCotacao(null);
    setCotacaoErro(null);
    void cotarEntrega({
      countryCode,
      addressId: destinoSelecionado.id,
      originLatitude: dados.origem.latitude,
      originLongitude: dados.origem.longitude,
      destinationLatitude: destinoSelecionado.latitude,
      destinationLongitude: destinoSelecionado.longitude,
    }).then((q) => { if (ativo) setCotacao(q); }).catch((e) => {
      if (ativo) setCotacaoErro(e instanceof Error ? e.message : 'Não foi possível calcular o preço.');
    });
    return () => { ativo = false; };
  }, [online, dados.origem?.latitude, dados.origem?.longitude, destinoSelecionado?.id, destinoSelecionado?.latitude, destinoSelecionado?.longitude]);


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
  const selecionarOrigemPorEntrada = (entrada: string) => {
    const referencia = posicao ? { latitude: posicao.latitude, longitude: posicao.longitude } : undefined;
    const r = interpretarEntrada(entrada, referencia);
    if (r.tipo !== 'ponto') {
      setErro(r.tipo === 'invalida' ? r.motivo : 'Este código/link precisa de uma localização válida.');
      return false;
    }
    mudar({ origem: { latitude: r.latitude, longitude: r.longitude, codigoPostal: null, plusCode: null } });
    setEntradaOrigem('');
    setLerQrOrigem(false);
    setModoOrigem('codigo');
    setErro(null);
    return true;
  };

  const selecionarPorEntrada = async (entrada: string): Promise<void> => {
    if (aProcurarDestino) return;
    const referencia = posicao ? { latitude: posicao.latitude, longitude: posicao.longitude } : undefined;
    setErro(null);
    setAProcurarDestino(true);
    const r = await resolverDestino(interpretarEntrada(entrada, referencia), {
      guardadas: moradas.itens ?? [],
      online,
      pesquisar: pesquisarNoServidor,
      async criarMorada(p) {
        if (!userId) throw new Error('Sem sessão iniciada.');
        const item = await servicoMoradas.guardarDoMapa(
          userId,
          { ...p, precisao: null, plusCode: encode(p.latitude, p.longitude), codigoPostal: null, provincia: null, municipio: null },
          { visibilidade: 'PRIVATE', categoria: 'entrega', nome: 'Destino de envio' },
        );
        mudancasMoradas.avisar();
        return item.morada!.id;
      },
    }).finally(() => setAProcurarDestino(false));
    if (r.tipo === 'erro') {
      setErro(r.mensagem);
      return;
    }
    mudar({ moradaId: r.moradaId });
    setDestinoNovo(r.tipo === 'nova' ? { moradaId: r.moradaId, texto: entrada.trim() } : null);
    setEntradaDestino('');
    setLerQr(false);
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
      const dadosComCarga: DadosEnvio = { ...dados, carga: { tipo:carga.tipo, descricao:carga.descricao, quantidade:carga.quantidade?Number(carga.quantidade):null, pesoKg:carga.pesoKg?Number(carga.pesoKg):null, comprimentoCm:carga.comprimentoCm?Number(carga.comprimentoCm):null, larguraCm:carga.larguraCm?Number(carga.larguraCm):null, alturaCm:carga.alturaCm?Number(carga.alturaCm):null, valorDeclarado:carga.valorDeclarado?Number(carga.valorDeclarado):null, tipoVeiculo:carga.tipoVeiculo||null, capacidadeVeiculoKg:carga.capacidadeVeiculoKg?Number(carga.capacidadeVeiculoKg):null } };
      // Destino novo: o pedido vai pela fila, logo a seguir à morada (senão o servidor ainda não a conhece).
      const destinoEhNovo = destinoNovo !== null && destinoNovo.moradaId === dados.moradaId;
      const r = await servicoEnvios.enviar(userId, dadosComCarga, online === true && !destinoEhNovo);
      if (r.tipo === 'enviado') {
        guardarEnvio(r.envio, r.pin, { tipo: 'sucesso', texto: 'Pedido enviado. Dá o PIN só a quem vai receber a encomenda.' });
        router.replace({ pathname: '/entrega/[id]', params: { id: r.envio.id } });
      } else {
        definirAvisoEnvios({ tipo: 'info', texto: destinoEhNovo ? AVISO_DESTINO_NOVO : AVISO_NA_FILA });
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

      <CabecalhoCartao titulo="De onde?" icone="origem" cor="verde" />
      <Opcoes grupo="Local de recolha" opcoes={[
        { valor: 'gps', nome: '📍 Minha localização' },
        ...(origensGuardadas.length > 0 ? [{ valor: 'guardado', nome: '⭐ Guardados' }] : []),
        { valor: 'codigo', nome: '🔢 Código' },
        { valor: 'qr', nome: '📷 QR' },
      ]} valor={modoOrigem} aoEscolher={(v) => {
        const modo = v as 'gps' | 'guardado' | 'codigo' | 'qr';
        setModoOrigem(modo);
        if (modo === 'gps') {
          setOrigemGuardadaId(null);
          setEntradaOrigem('');
          setLerQrOrigem(false);
          mudar({ origem: undefined });
          return;
        }
        if (modo === 'codigo') {
          setOrigemGuardadaId(null);
          setLerQrOrigem(false);
          return;
        }
        if (modo === 'qr') {
          setOrigemGuardadaId(null);
          setEntradaOrigem('');
          setLerQrOrigem(true);
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
      {modoOrigem === 'codigo' ? (
        <>
          <Campo rotulo="Código, Plus Code ou link da recolha" value={entradaOrigem} onChangeText={setEntradaOrigem} autoCapitalize="characters" placeholder="Ex.: AO-HUA-... ou link do mapa" />
          <Botao titulo="Procurar" variante="secundario" onPress={() => selecionarOrigemPorEntrada(entradaOrigem)} desativado={!entradaOrigem.trim()} />
        </>
      ) : null}
      {lerQrOrigem ? (
        <LeitorQr aoLer={(conteudo) => selecionarOrigemPorEntrada(conteudo)} aoFechar={() => { setLerQrOrigem(false); setModoOrigem('gps'); }} />
      ) : null}
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
      <CabecalhoCartao titulo="Para onde?" icone="destino" cor="vermelho" />
      {destinos.length > 0 ? (
        <Opcoes grupo="Morada de destino" empilhadas opcoes={destinos} valor={dados.moradaId} aoEscolher={(v) => { setDestinoNovo(null); mudar({ moradaId: v }); }} />
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
        onPress={() => void selecionarPorEntrada(entradaDestino)}
        desativado={!entradaDestino.trim() || aProcurarDestino}
        aCarregar={aProcurarDestino}
      />
      <Botao titulo="Ler QR do destino" variante="secundario" onPress={() => { setErro(null); setLerQr(true); }} />

      {lerQr ? (
        <LeitorQr
          aoLer={(conteudo) => void selecionarPorEntrada(conteudo)}
          aoFechar={() => setLerQr(false)}
        />
      ) : null}

      {destinoNovo && dados.moradaId === destinoNovo.moradaId ? (
        <Caixa tipo="info">
          {`Destino: ${destinoNovo.texto}\nÉ um sítio novo: fica nas tuas Moradas como privado e por validar. O pedido vai para o servidor logo a seguir a ele.`}
        </Caixa>
      ) : null}
      {destinos.length === 0 && !destinoNovo ? (
        <Caixa tipo="info">
          Ainda não tens moradas guardadas. Escreve o Plus Code, cola o link do mapa ou lê o QR do destino.
        </Caixa>
      ) : null}

      <CabecalhoCartao titulo="Carga" icone="carga" cor="ambar" />
      <Opcoes grupo="Tipo de carga" opcoes={[
        { valor: 'Encomenda', nome: '📦 Encomenda' }, { valor: 'Documentos', nome: '📄 Documentos' },
        { valor: 'Alimentos', nome: '🍎 Alimentos' }, { valor: 'Frágil', nome: '⚠️ Frágil' },
        { valor: 'Mobiliário', nome: '🪑 Mobiliário' }, { valor: 'Outro', nome: 'Outro' },
      ]} valor={carga.tipo} aoEscolher={(v) => setCarga((x) => ({ ...x, tipo: String(v) }))} />
      <Campo rotulo="Descrição da carga (opcional)" value={carga.descricao} onChangeText={(v) => setCarga((x) => ({ ...x, descricao: v }))} placeholder="Ex.: caixa de roupas" />
      <Campo rotulo="Quantidade" value={carga.quantidade} onChangeText={(v) => setCarga((x) => ({ ...x, quantidade: v }))} keyboardType="numeric" placeholder="Ex.: 2" />
      <Campo rotulo="Peso total (kg)" value={carga.pesoKg} onChangeText={(v) => setCarga((x) => ({ ...x, pesoKg: v }))} keyboardType="decimal-pad" placeholder="Ex.: 15" />
      <Texto suave>Dimensões opcionais (cm).</Texto>
      <Campo rotulo="Comprimento" value={carga.comprimentoCm} onChangeText={(v) => setCarga((x) => ({ ...x, comprimentoCm: v }))} keyboardType="decimal-pad" placeholder="cm" />
      <Campo rotulo="Largura" value={carga.larguraCm} onChangeText={(v) => setCarga((x) => ({ ...x, larguraCm: v }))} keyboardType="decimal-pad" placeholder="cm" />
      <Campo rotulo="Altura" value={carga.alturaCm} onChangeText={(v) => setCarga((x) => ({ ...x, alturaCm: v }))} keyboardType="decimal-pad" placeholder="cm" />
      <Campo rotulo="Valor declarado (Kz, opcional)" value={carga.valorDeclarado} onChangeText={(v) => setCarga((x) => ({ ...x, valorDeclarado: v }))} keyboardType="decimal-pad" placeholder="Ex.: 50000" />
      <CabecalhoCartao titulo="Veículo pretendido" icone="motorista" cor="azul" />
      <Opcoes grupo="Tipo de veículo" opcoes={[
        { valor: 'moto', nome: '🏍️ Moto' }, { valor: 'carro', nome: '🚗 Carro' },
        { valor: 'carrinha', nome: '🚐 Carrinha' }, { valor: 'furgão', nome: '🚚 Furgão' },
        { valor: 'camião', nome: '🚛 Camião' },
      ]} valor={carga.tipoVeiculo || null} aoEscolher={(v) => setCarga((x) => ({ ...x, tipoVeiculo: String(v) }))} />
      <Campo rotulo="Capacidade mínima pretendida (kg, opcional)" value={carga.capacidadeVeiculoKg} onChangeText={(v) => setCarga((x) => ({ ...x, capacidadeVeiculoKg: v }))} keyboardType="decimal-pad" placeholder="Ex.: 500" />

      <CabecalhoCartao titulo="Quem vai receber?" icone="conta" cor="roxo" />
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
      <CabecalhoCartao titulo="Nota para o estafeta" icone="nota" cor="ambar" />
      <Opcoes grupo="Sugestões rápidas" opcoes={[
        { valor: 'Portão azul', nome: 'Portão azul' },
        { valor: 'Entrada lateral', nome: 'Entrada lateral' },
        { valor: 'Ligar à chegada', nome: 'Ligar à chegada' },
        { valor: 'Entregar após 17h', nome: 'Entregar após 17h' },
      ]} valor={null} aoEscolher={(v) => mudar({ instrucoes: [dados.instrucoes, String(v)].filter(Boolean).join('\n') })} />
      <Campo
        rotulo={`Instruções para o estafeta (opcional, até ${MAX_INSTRUCOES} letras)`}
        value={dados.instrucoes}
        onChangeText={(t) => mudar({ instrucoes: t })}
        multiline
        placeholder="Ex.: Portão azul, entrada lateral"
      />

      <CabecalhoCartao titulo="Prioridade" icone="prioridade" cor="vermelho" />
      {online ? (
        <Caixa tipo="info">
          {cotacao ? textoCotacao(cotacao) : cotacaoErro ? 'Preço: não disponível neste momento; podes continuar e o servidor recalcula ao criar.' : 'Preço: a calcular…'}
        </Caixa>
      ) : null}
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
              `Destino: ${destinos.find((d) => d.valor === dados.moradaId)?.nome ?? (destinoNovo?.moradaId === dados.moradaId ? `${destinoNovo.texto} (sítio novo)` : 'morada selecionada')}`,
              `Destinatário: ${dados.destinatario}`,
              dados.telefone.trim() ? `Telefone: ${dados.telefone.trim()}` : 'Telefone: não indicado',
              dados.instrucoes.trim() ? `Instruções: ${dados.instrucoes.trim()}` : 'Instruções: não indicadas',
              `Prioridade: ${dados.urgente ? 'Urgente' : 'Normal'}`,
            ].join('\n')}
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
