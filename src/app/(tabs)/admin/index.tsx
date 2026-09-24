import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { listarPedidosKyc } from '@/api/revisaoKyc';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Cartao, Ecra, Subtitulo, Texto, Titulo } from '@/components/ui';
import { dataEnvio, detalhesDoPedido, nomeDoPedido, podeReverKyc } from '@/domain/identidade/revisaoKyc';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { lojaRevisaoKyc, useRevisaoKyc } from '@/state/revisaoKyc';

/**
 * Admin: lista das verificações simples por rever. Cada pedido abre num ecrã
 * próprio (admin/[id]); o botão Voltar regressa a esta lista, tal como estava.
 * Só com rede.
 */
export default function ListaVerificacoes() {
  const router = useRouter();
  const online = useOnline();
  const cargos = useSessao().perfil?.cargos ?? [];
  const revisor = podeReverKyc(cargos);
  const { pedidos, aviso } = useRevisaoKyc();
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro(null);
    try {
      const lista = await listarPedidosKyc();
      lojaRevisaoKyc.definir((e) => ({ ...e, pedidos: lista }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    if (revisor && online) void carregar();
  }, [revisor, online, carregar]);

  const abrir = (userId: string) => {
    lojaRevisaoKyc.definir((e) => ({ ...e, aviso: null }));
    router.push({ pathname: '/admin/[id]', params: { id: userId } });
  };

  return (
    <Ecra>
      <Titulo>Admin</Titulo>
      <Subtitulo>Verificações por rever</Subtitulo>

      {!revisor ? (
        <Caixa tipo="info">Só os administradores podem aprovar ou recusar verificações de identidade.</Caixa>
      ) : online === false ? (
        <Caixa tipo="aviso">Sem rede. A revisão das verificações precisa de rede (as fotos não ficam neste telemóvel).</Caixa>
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
              <Botao titulo={`Rever ${nomeDoPedido(p)}`} onPress={() => abrir(p.userId)} desativado={aCarregar} />
            </Cartao>
          ))}
          <Botao titulo="Atualizar" variante="secundario" onPress={() => void carregar()} aCarregar={aCarregar} />
        </>
      )}
    </Ecra>
  );
}

const estilos = StyleSheet.create({
  nomePedido: { fontSize: TAMANHOS.subtitulo, fontWeight: '800', color: CORES.texto },
});
