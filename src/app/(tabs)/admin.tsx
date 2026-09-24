import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { decidirPedidoKyc, lerFotoKyc, listarPedidosKyc } from '@/api/revisaoKyc';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Campo, Cartao, Ecra, Subtitulo, Texto, Titulo } from '@/components/ui';
import {
  dataEnvio,
  detalhesDoPedido,
  erroMotivo,
  idCurto,
  MOTIVOS_RAPIDOS,
  nomeDoPedido,
  podeReverKyc,
  VALIDADE_LINKS_MS,
  type PedidoKyc,
} from '@/domain/identidade/revisaoKyc';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';

type Aviso = { tipo: 'sucesso' | 'info' | 'erro'; texto: string };

/**
 * Admin: revisão das verificações simples dos cidadãos (BI frente, BI verso e
 * selfies). Só com rede. As fotos são privadas: chegam por links temporários
 * (10 min) e ficam só na memória deste ecrã.
 */
export default function Admin() {
  const online = useOnline();
  const cargos = useSessao().perfil?.cargos ?? [];
  const revisor = podeReverKyc(cargos);

  const [pedidos, setPedidos] = useState<PedidoKyc[] | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const carregadoEm = useRef(0);

  const carregar = useCallback(async (): Promise<PedidoKyc[] | null> => {
    setACarregar(true);
    setErro(null);
    try {
      const lista = await listarPedidosKyc();
      carregadoEm.current = Date.now();
      setPedidos(lista);
      return lista;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    if (revisor && online) void carregar();
  }, [revisor, online, carregar]);

  const abrir = async (userId: string) => {
    setAviso(null);
    // Os links das fotos duram 10 minutos: se a lista é antiga, pede links novos.
    if (Date.now() - carregadoEm.current > VALIDADE_LINKS_MS) {
      const lista = await carregar();
      if (!lista?.some((p) => p.userId === userId)) return;
    }
    setAberto(userId);
  };

  const decidido = (userId: string, aprovado: boolean) => {
    const p = pedidos?.find((x) => x.userId === userId);
    const quem = p ? nomeDoPedido(p) : idCurto(userId);
    setPedidos((l) => (l ?? []).filter((p) => p.userId !== userId));
    setAberto(null);
    setAviso(
      aprovado
        ? { tipo: 'sucesso', texto: `Verificação de ${quem} aprovada ✅ O cidadão já pode registar moradas.` }
        : { tipo: 'info', texto: `Verificação de ${quem} recusada. O cidadão recebe o motivo.` },
    );
  };

  const pedido = pedidos?.find((p) => p.userId === aberto) ?? null;

  return (
    <Ecra>
      <Titulo>Admin</Titulo>
      <Subtitulo>Verificações por rever</Subtitulo>

      {!revisor ? (
        <Caixa tipo="info">Só os administradores podem aprovar ou recusar verificações de identidade.</Caixa>
      ) : online === false ? (
        <Caixa tipo="aviso">Sem rede. A revisão das verificações precisa de rede (as fotos não ficam neste telemóvel).</Caixa>
      ) : pedido ? (
        <RevisaoPedido
          key={pedido.userId}
          pedido={pedido}
          aoVoltar={() => setAberto(null)}
          aoDecidir={(aprovado) => decidido(pedido.userId, aprovado)}
          aoExpirar={() => void carregar()}
        />
      ) : (
        <>
          {aviso ? <Caixa tipo={aviso.tipo}>{aviso.texto}</Caixa> : null}
          {erro ? <Caixa tipo="erro">{`Não foi possível ler os pedidos: ${erro}`}</Caixa> : null}
          {pedidos === null && aCarregar ? <Texto>A procurar pedidos…</Texto> : null}
          {pedidos !== null && pedidos.length === 0 ? <Texto>Não há verificações por rever. 👍</Texto> : null}
          {(pedidos ?? []).map((p) => (
            <Cartao key={p.userId}>
              <Text style={estilos.nomePedido}>{nomeDoPedido(p)}</Text>
              {detalhesDoPedido(p).map((l) => (
                <Texto key={l} suave>
                  {l}
                </Texto>
              ))}
              <Texto suave>{`Enviado a ${dataEnvio(p.enviadoEm)}`}</Texto>
              <Botao titulo={`Rever ${nomeDoPedido(p)}`} onPress={() => void abrir(p.userId)} desativado={aCarregar} />
            </Cartao>
          ))}
          <Botao titulo="Atualizar" variante="secundario" onPress={() => void carregar()} aCarregar={aCarregar} />
        </>
      )}
    </Ecra>
  );
}

function RevisaoPedido({
  pedido,
  aoVoltar,
  aoDecidir,
  aoExpirar,
}: {
  pedido: PedidoKyc;
  aoVoltar(): void;
  aoDecidir(aprovado: boolean): void;
  aoExpirar(): void;
}) {
  const [modo, setModo] = useState<'ver' | 'confirmar' | 'recusar'>('ver');
  const [motivo, setMotivo] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const problemaMotivo = erroMotivo(motivo);

  const decidir = async (aprovar: boolean) => {
    setAEnviar(true);
    setErro(null);
    try {
      await decidirPedidoKyc(pedido.userId, aprovar ? { aprovar: true } : { aprovar: false, motivo });
      aoDecidir(aprovar);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setAEnviar(false);
    }
  };

  return (
    <View style={estilos.bloco}>
      <Text style={estilos.nomePedido}>{nomeDoPedido(pedido)}</Text>
      {detalhesDoPedido(pedido).map((l) => (
        <Texto key={l} suave>
          {l}
        </Texto>
      ))}
      <Texto suave>{`Enviado a ${dataEnvio(pedido.enviadoEm)}`}</Texto>
      <Texto suave>
        Confirma que o BI é legível, que a cara da selfie é a do BI e que a segunda selfie mostra o gesto escrito na
        marca de água.
      </Texto>
      <FotoPrivada titulo="BI — frente" url={pedido.frente} aoExpirar={aoExpirar} />
      <FotoPrivada titulo="BI — verso" url={pedido.verso} aoExpirar={aoExpirar} />
      <FotoPrivada titulo="Selfies (normal e com o gesto)" url={pedido.selfie} aoExpirar={aoExpirar} />

      {erro ? <Caixa tipo="erro">{`Não foi possível guardar a decisão: ${erro}`}</Caixa> : null}

      {modo === 'ver' ? (
        <>
          <Botao titulo="Aprovar" onPress={() => setModo('confirmar')} />
          <Botao titulo="Recusar" variante="secundario" onPress={() => setModo('recusar')} />
        </>
      ) : null}

      {modo === 'confirmar' ? (
        <>
          <Caixa tipo="aviso">Aprovar deixa este cidadão registar moradas. Confirmas que as fotos estão certas?</Caixa>
          <Botao titulo="Sim, aprovar" onPress={() => void decidir(true)} aCarregar={aEnviar} />
          <Botao titulo="Cancelar" variante="secundario" onPress={() => setModo('ver')} desativado={aEnviar} />
        </>
      ) : null}

      {modo === 'recusar' ? (
        <>
          <Subtitulo>Motivo da recusa</Subtitulo>
          <Texto suave>O cidadão vê este motivo e tem de tirar as fotos de novo.</Texto>
          {MOTIVOS_RAPIDOS.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`Motivo: ${m}`}
              onPress={() => setMotivo(m)}
              style={[estilos.motivo, motivo === m && estilos.motivoEscolhido]}
            >
              <Text style={estilos.textoMotivo}>{m}</Text>
            </Pressable>
          ))}
          <Campo rotulo="Motivo da recusa" value={motivo} onChangeText={setMotivo} multiline maxLength={300} />
          {motivo.length > 0 && problemaMotivo ? <Texto suave>{problemaMotivo}</Texto> : null}
          <Botao
            titulo="Recusar a verificação"
            onPress={() => void decidir(false)}
            desativado={!!problemaMotivo}
            aCarregar={aEnviar}
          />
          <Botao titulo="Cancelar" variante="secundario" onPress={() => setModo('ver')} desativado={aEnviar} />
        </>
      ) : null}

      <Botao titulo="Voltar à lista" variante="secundario" onPress={aoVoltar} desativado={aEnviar} />
    </View>
  );
}

/** Uma foto do bucket privado, mostrada só a partir da memória. */
function FotoPrivada({ titulo, url, aoExpirar }: { titulo: string; url: string | null; aoExpirar(): void }) {
  const [dados, setDados] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro(null);
    if (url) {
      lerFotoKyc(url).then(
        (d) => ativo && setDados(d),
        (e: unknown) => ativo && setErro(e instanceof Error ? e.message : String(e)),
      );
    }
    return () => {
      ativo = false;
    };
  }, [url]);

  return (
    <Cartao>
      <Subtitulo>{titulo}</Subtitulo>
      {!url ? (
        <Caixa tipo="erro">Esta foto não está no arquivo.</Caixa>
      ) : dados ? (
        <Image source={{ uri: dados }} style={estilos.foto} resizeMode="contain" accessibilityLabel={`Foto: ${titulo}`} />
      ) : erro ? (
        <>
          <Caixa tipo="erro">{`A foto não abriu: ${erro}`}</Caixa>
          <Botao titulo="Pedir links novos" variante="secundario" onPress={aoExpirar} />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel={`A abrir: ${titulo}`} color={CORES.primaria} />
      )}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 12 },
  nomePedido: { fontSize: TAMANHOS.subtitulo, fontWeight: '800', color: CORES.texto },
  foto: { width: '100%', height: 260, backgroundColor: '#000' },
  motivo: {
    borderWidth: 2,
    borderColor: CORES.borda,
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  motivoEscolhido: { borderColor: CORES.primaria, backgroundColor: CORES.avisoFundo },
  textoMotivo: { fontSize: TAMANHOS.texto, color: CORES.texto },
});
