import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Duplicado, Rua } from '@/api/registoNucleo';
import { CamaraFachada } from '@/components/CamaraFachada';
import { textoPrecisao } from '@/components/nomes';
import { Opcoes } from '@/components/Opcoes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Campo, Cartao, Linha, Subtitulo, Texto } from '@/components/ui';
import { codificarGrelha } from '@/domain/enderecamento/codigoPostal';
import { encode } from '@/domain/enderecamento/plusCode';
import {
  codigosDasDuasCelulas,
  faltaParaEnviar,
  linhasMarcaDeAgua,
  pontoAEnviar,
  situacaoLimite,
  TIPO_OUTRO_MAX,
  TIPOS_LOCAL,
  type EscolhaCelula,
  type TipoLocal,
} from '@/domain/enderecamento/registoMorada';
import { useCapturaGps } from '@/hooks/useCapturaGps';
import { useInfoLocal } from '@/hooks/useInfoLocal';
import { useOnline } from '@/hooks/useOnline';
import { usePosicao } from '@/hooks/usePosicao';
import { useSessao } from '@/hooks/useSessao';
import { fotoComMarcaDeAgua } from '@/services/imagem/fotoComMarca';
import { podeRegistar, type QuadraDoPonto, type Verificacao } from '@/services/moradas/registo';
import { servicoRegisto } from '@/services/moradas/registoApp';

const RUA_NOVA = '__nova__';
const BAIRRO_NOVO = '__novo__';
/** Porque é que ainda não pode registar (null = pode). */
function motivoBloqueio(v: Verificacao | null): { texto: string; botao: string | null } | null {
  switch (v) {
    case 'por_verificar':
      return {
        texto: 'Para registar uma morada tens de fazer primeiro a verificação simples da identidade (fotos do BI e uma selfie). Leva 2 minutos.',
        botao: 'Fazer a verificação simples',
      };
    case 'pendente':
      return {
        texto: 'A tua verificação simples está guardada neste telemóvel e é enviada quando houver rede. Depois, a equipa revê-a; só com ela aprovada podes registar moradas.',
        botao: null,
      };
    case 'em_revisao':
      return {
        texto: 'A tua verificação simples está em revisão pela equipa. Quando for aprovada, já podes registar moradas.',
        botao: 'Ver a verificação',
      };
    case 'rejeitado':
      return {
        texto: 'A tua verificação simples não foi aprovada. Faz de novo (vê o motivo na verificação) para poderes registar moradas.',
        botao: 'Fazer a verificação de novo',
      };
    default:
      return null;
  }
}

const NOME_LADO = { norte: 'a norte', sul: 'a sul', este: 'a este', oeste: 'a oeste' } as const;

export default function RegistarMorada() {
  const router = useRouter();
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const gps = usePosicao();
  const medida = useCapturaGps(gps.estado === 'ok' ? gps.posicao : null);
  const captura = medida.captura;
  const boa = captura && !captura.fraca ? captura : null;
  const info = useInfoLocal(boa, online);
  const provincia = info?.local.provincia ?? null;

  const [verificacao, setVerificacao] = useState<Verificacao | null>(null);
  const [ruas, setRuas] = useState<Rua[]>([]);
  const [ruasDoServidor, setRuasDoServidor] = useState(false);
  const [bairros, setBairros] = useState<string[]>([]);
  const [quadraDoPonto, setQuadraDoPonto] = useState<QuadraDoPonto | null>(null);
  const [bairro, setBairro] = useState<string | null>(null);
  const [bairroNome, setBairroNome] = useState('');
  const [duplicado, setDuplicado] = useState<Duplicado | null | undefined>(undefined);
  const [escolha, setEscolha] = useState<EscolhaCelula | null>(null);
  const [tipo, setTipo] = useState<TipoLocal | null>('Casa');
  const [tipoOutro, setTipoOutro] = useState('');
  const [rua, setRua] = useState<string | null>(null);
  const [ruaNome, setRuaNome] = useState('');
  const [referencia, setReferencia] = useState('');
  const [foto, setFoto] = useState<{ uri: string; marcador: string } | null>(null);
  const [duplicadoConfirmado, setDuplicadoConfirmado] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ comRede: boolean } | null>(null);

  useEffect(() => {
    if (userId && online !== null) void servicoRegisto.verificacao(userId, online).then(setVerificacao);
  }, [userId, online]);

  const limite = boa ? situacaoLimite(boa.latitude, boa.longitude, boa.precisao) : null;
  // A posição que vai ser enviada (junto ao limite: 1 m dentro da célula escolhida).
  const ponto = boa ? pontoAEnviar(boa, escolha) : null;

  // Ruas e bairros: pedidos com a posição a ENVIAR (a da célula escolhida, se a
  // pessoa escolheu) e de novo sempre que a célula dessa posição mudar.
  const celulaAEnviar = ponto ? codificarGrelha(ponto.latitude, ponto.longitude) : null;
  useEffect(() => {
    if (!ponto || online === null) return;
    let ativo = true;
    void servicoRegisto.ruasPerto(ponto.latitude, ponto.longitude, online).then((r) => {
      if (!ativo) return;
      setRuas(r.ruas);
      setBairros(r.bairros);
      setQuadraDoPonto(r.quadra);
      setRuasDoServidor(r.doServidor);
    });
    return () => {
      ativo = false;
    };
  }, [celulaAEnviar, online]);
  const codigos = useMemo(
    () => (boa && limite?.junto ? codigosDasDuasCelulas(boa.latitude, boa.longitude, provincia) : null),
    [boa?.latitude, boa?.longitude, limite?.junto, provincia],
  );
  // A medição vai melhorando (a posição mexe uns centímetros a cada leitura):
  // a escolha só deixa de valer se mudarem as duas células em causa.
  const parDeCelulas = codigos ? `${codigos.esta}|${codigos.vizinha}` : null;
  useEffect(() => setEscolha(null), [parDeCelulas]);

  // Morada duplicada perto: pergunta de novo só quando muda a célula (não a cada leitura).
  const celula = boa ? codificarGrelha(boa.latitude, boa.longitude) : null;
  useEffect(() => {
    if (!boa || online === null) return;
    let ativo = true;
    void servicoRegisto.duplicadoPerto(boa.latitude, boa.longitude, online).then((d) => ativo && setDuplicado(d));
    return () => {
      ativo = false;
    };
  }, [celula, online]);

  const dados = {
    captura,
    escolhaCelula: escolha,
    tipo,
    tipoOutro: tipo === 'Outro' ? tipoOutro : '',
    ruaId: rua && rua !== RUA_NOVA ? rua : null,
    ruaNome: rua === RUA_NOVA || ruas.length === 0 ? ruaNome : '',
    bairro: bairro && bairro !== BAIRRO_NOVO ? bairro : bairro === BAIRRO_NOVO || bairros.length === 0 ? bairroNome : '',
    referencia,
    foto: foto?.marcador ?? null,
    duplicadoConfirmado,
    haDuplicado: !!duplicado,
  };
  const falta = faltaParaEnviar(dados);
  const bloqueio = verificacao === null ? null : motivoBloqueio(verificacao);
  const bloqueado = !podeRegistar(verificacao);

  const fotografar = async (uriCamara: string) => {
    if (!boa) throw new Error('Espera pela medição da posição.');
    // A marca de água leva a posição medida pelo GPS (a prova de onde a foto foi tirada).
    const pronta = await fotoComMarcaDeAgua(
      uriCamara,
      linhasMarcaDeAgua(encode(boa.latitude, boa.longitude), boa.latitude, boa.longitude, new Date()),
    );
    const marcador = await servicoRegisto.guardarFoto(pronta);
    setFoto({ uri: pronta.uri, marcador });
  };

  const enviar = async () => {
    if (!userId) return;
    setAEnviar(true);
    setErro(null);
    try {
      await servicoRegisto.enviar(userId, dados);
      setEnviado({ comRede: !!online });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAEnviar(false);
    }
  };

  if (enviado) {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Caixa tipo="sucesso">
          {enviado.comRede
            ? 'Registo enviado para revisão. Quando for aprovado, recebes o Código Postal Digital e o número da porta.'
            : 'Sem rede: o registo ficou guardado neste telemóvel e é enviado sozinho para revisão quando houver rede.'}
        </Caixa>
        <Botao titulo="Voltar às moradas" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const precisao = captura ? textoPrecisao(captura.precisao) : null;

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      {bloqueio ? (
        <View style={estilos.bloco}>
          <Caixa tipo={verificacao === 'pendente' || verificacao === 'em_revisao' ? 'info' : 'erro'}>{bloqueio.texto}</Caixa>
          {bloqueio.botao ? <Botao titulo={bloqueio.botao} onPress={() => router.push('/definicoes/verificacao')} /> : null}
        </View>
      ) : null}
      {verificacao === 'desconhecido' ? (
        <Caixa tipo="aviso">
          Sem rede não deu para confirmar a tua verificação de identidade. O registo fica guardado e é enviado quando
          houver rede; se ainda não fizeste a verificação simples, o servidor não o aceita.
        </Caixa>
      ) : null}

      <Cartao>
        <Subtitulo>1. Onde fica</Subtitulo>
        {!captura ? (
          <Texto>
            {gps.estado === 'ok'
              ? `A medir a posição… leitura ${medida.leiturasBoas} de ${medida.necessarias} com menos de ±${medida.limite} m. Fica parado à entrada.`
              : gps.estado === 'sem_permissao' || gps.estado === 'gps_desligado'
                ? 'Liga o GPS e autoriza a localização para registar a morada.'
                : 'A procurar o sinal do GPS… Vai para um sítio aberto.'}
          </Texto>
        ) : (
          <>
            <Linha nome="Plus Code" valor={encode(captura.latitude, captura.longitude)} />
            <Linha nome="Precisão do GPS" valor={precisao!.qualidade ? `${precisao!.texto} (${precisao!.qualidade})` : precisao!.texto} />
            {captura.fraca ? (
              <Caixa tipo="aviso">
                {`Precisão acima de ${medida.limite} m: só se pode registar com menos de ±${medida.limite} m. Vai para um sítio aberto, junto à entrada; a medição continua sozinha.`}
              </Caixa>
            ) : null}
            {limite?.junto && codigos ? (
              <View style={estilos.bloco}>
                <Caixa tipo="aviso">
                  {`Estás a ${Math.max(1, Math.round(limite.distanciaM))} m do limite entre duas células do código postal. Para o código não ficar "à sorte": vai para o centro da entrada da casa e carrega em "Medir de novo", ou escolhe a célula da casa.`}
                </Caixa>
                <Botao titulo="Medir de novo" variante="secundario" onPress={medida.medirDeNovo} desativado={medida.aMedir} />
                <Text style={estilos.rotulo}>Em que célula fica a casa?</Text>
                <Opcoes<EscolhaCelula>
                  grupo="Célula"
                  empilhadas
                  valor={escolha}
                  aoEscolher={setEscolha}
                  opcoes={[
                    { valor: 'esta', nome: 'Esta célula (onde estás)', detalhe: codigos.esta },
                    { valor: 'vizinha', nome: `A célula vizinha (${NOME_LADO[limite.lado]})`, detalhe: codigos.vizinha },
                  ]}
                />
                <Texto suave>O código final (com o "-N", se houver) é dado pelo servidor quando a morada for aprovada.</Texto>
              </View>
            ) : null}
            {medida.aMedir && !captura.fraca ? <Texto suave>A medir de novo…</Texto> : null}
          </>
        )}
      </Cartao>

      <Cartao>
        <Subtitulo>2. O local</Subtitulo>
        <Text style={estilos.rotulo}>Tipo de local</Text>
        <Opcoes<TipoLocal> grupo="Tipo de local" valor={tipo} aoEscolher={setTipo} opcoes={TIPOS_LOCAL.map((t) => ({ valor: t, nome: t }))} />
        {tipo === 'Outro' ? (
          <Campo
            rotulo="Que tipo de local é?"
            value={tipoOutro}
            onChangeText={setTipoOutro}
            placeholder="Descreve o tipo de local. Ex.: Padaria, Oficina…"
            maxLength={TIPO_OUTRO_MAX}
            autoCapitalize="sentences"
          />
        ) : null}
        {quadraDoPonto?.mapeada ? (
          <View style={estilos.chip} accessibilityLabel={`Quadra ${quadraDoPonto.codigo}`}>
            <Text style={estilos.textoChip}>{`📍 Quadra: ${quadraDoPonto.codigo}`}</Text>
          </View>
        ) : quadraDoPonto ? (
          <Texto suave>A quadra desta zona ainda não está delimitada.</Texto>
        ) : null}
        <Text style={estilos.rotulo}>Rua</Text>
        {ruas.length > 0 ? (
          <Opcoes
            grupo="Rua"
            empilhadas
            valor={rua}
            aoEscolher={setRua}
            opcoes={[...ruas.map((r) => ({ valor: r.id, nome: r.nome })), { valor: RUA_NOVA, nome: 'A rua não está na lista' }]}
          />
        ) : (
          <Texto suave>
            {boa && !ruasDoServidor && online === false
              ? 'Sem rede e sem ruas guardadas desta zona: escreve o nome da rua.'
              : 'Ainda não há ruas conhecidas aqui: escreve o nome da rua.'}
          </Texto>
        )}
        {ruas.length === 0 || rua === RUA_NOVA ? (
          <Campo rotulo="Nome da rua" value={ruaNome} onChangeText={setRuaNome} placeholder="Ex.: Rua da Missão" maxLength={80} />
        ) : null}
        <Text style={estilos.rotulo}>Bairro</Text>
        {bairros.length > 0 ? (
          <Opcoes
            grupo="Bairro"
            empilhadas
            valor={bairro}
            aoEscolher={setBairro}
            opcoes={[
              ...bairros.map((b) => ({ valor: b, nome: b })),
              { valor: BAIRRO_NOVO, nome: 'Outro bairro (escrever à mão)' },
            ]}
          />
        ) : (
          <Texto suave>Ainda não há bairros conhecidos aqui: escreve o nome do bairro.</Texto>
        )}
        {bairros.length === 0 || bairro === BAIRRO_NOVO ? (
          <Campo rotulo="Nome do bairro" value={bairroNome} onChangeText={setBairroNome} placeholder="Ex.: Bairro Académico" maxLength={80} />
        ) : null}
        <Campo
          rotulo="Referência (para ajudar a encontrar)"
          value={referencia}
          onChangeText={setReferencia}
          placeholder="Ex.: portão azul, ao lado da farmácia"
          maxLength={120}
        />
      </Cartao>

      <Cartao>
        <Subtitulo>3. Foto da fachada</Subtitulo>
        <CamaraFachada
          foto={foto?.uri ?? null}
          podeFotografar={!!boa}
          motivoSemCamara="Primeiro espera pela medição da posição (a foto leva o Plus Code na marca de água)."
          aoFotografar={fotografar}
          aoApagar={() => setFoto(null)}
        />
      </Cartao>

      {duplicado ? (
        <Cartao>
          <Caixa tipo="aviso">
            {`Já existe uma morada a ${Math.round(duplicado.distanciaM)} m${duplicado.codigoPostal ? `: ${duplicado.codigoPostal}` : ''}. Se for mesmo um local diferente, confirma.`}
          </Caixa>
          <Opcoes
            grupo="Morada perto"
            valor={duplicadoConfirmado ? 'sim' : null}
            aoEscolher={() => setDuplicadoConfirmado((v) => !v)}
            opcoes={[{ valor: 'sim', nome: 'É um local diferente' }]}
          />
        </Cartao>
      ) : null}

      {falta.length > 0 ? (
        <View style={estilos.falta} accessibilityLabel="O que falta">
          <Text style={estilos.rotulo}>Falta:</Text>
          {falta.map((f) => (
            <Text key={f} style={estilos.itemFalta}>{`• ${f}`}</Text>
          ))}
        </View>
      ) : null}
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      <Botao
        titulo="Enviar para revisão"
        onPress={() => void enviar()}
        desativado={falta.length > 0 || bloqueado || !userId}
        aCarregar={aEnviar}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: TAMANHOS.margem, gap: 12 },
  bloco: { gap: 10 },
  rotulo: { fontSize: 15, color: CORES.textoSuave, fontWeight: '600' },
  falta: { gap: 4 },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: CORES.primaria,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  textoChip: { fontSize: TAMANHOS.texto, fontWeight: '700', color: CORES.primaria },
  itemFalta: { fontSize: TAMANHOS.textoPequeno, color: CORES.texto },
});
