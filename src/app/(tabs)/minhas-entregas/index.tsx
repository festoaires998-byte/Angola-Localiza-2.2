import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CORES, TAMANHOS } from '@/components/tema';
import { Caixa, EcraCarregamento, Ecra, Texto, Titulo } from '@/components/ui';
import { entregaTerminada, nomeEstadoEntrega, type Envio } from '@/domain/entregas/envio';
import { estadoEfetivo } from '@/domain/entregas/estafeta';
import { recarregarEntregasOrganizacao, recarregarEstafeta, useEntregasEstafeta } from '@/hooks/useEntregasEstafeta';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { acoesDaEntrega, type AcaoNaFila } from '@/services/entregas/estafeta';
import { definirAvisoEstafeta } from '@/state/estafeta';

function ItemEntrega({ entrega, acoes, aoAbrir }: { entrega: Envio; acoes: AcaoNaFila[]; aoAbrir(): void }) {
  const estado = nomeEstadoEntrega(estadoEfetivo(entrega.estado, acoes));
  const aEspera = acoes.some((a) => a.erro === null);
  const recusada = acoes.some((a) => a.erro !== null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Entrega para ${entrega.destinatario}. ${estado}`}
      onPress={aoAbrir}
      style={({ pressed }) => [estilos.item, pressed && estilos.premido]}
    >
      <Text style={estilos.titulo} numberOfLines={1}>
        {entrega.destinatario}
      </Text>
      {entrega.morada?.referencia ? <Text style={estilos.detalhe}>{entrega.morada.referencia}</Text> : null}
      {entrega.morada?.codigoPostal ? <Text style={estilos.codigo}>{entrega.morada.codigoPostal}</Text> : null}
      <View style={estilos.etiquetas}>
        <Text style={estilos.etiqueta}>{estado}</Text>
        {entrega.urgente ? <Text style={[estilos.etiqueta, estilos.etiquetaAviso]}>Urgente</Text> : null}
        {aEspera ? <Text style={[estilos.etiqueta, estilos.etiquetaAviso]}>À espera de rede</Text> : null}
        {recusada ? <Text style={[estilos.etiqueta, estilos.etiquetaErro]}>Recusada pelo servidor</Text> : null}
      </View>
    </Pressable>
  );
}

/** Separador Entregas: as entregas atribuídas ao estafeta (as por fazer primeiro). */
export default function Entregas() {
  const online = useOnline();
  const sessao = useSessao();
  const userId = sessao.utilizador?.id ?? null;
  const cargos = sessao.perfil?.cargos ?? [];
  const eEstafeta = cargos.includes('estafeta');
  const visaoOrganizacao = cargos.includes('operador_postal') || cargos.includes('super_admin');
  const router = useRouter();
  const estado = useEntregasEstafeta(eEstafeta ? userId : null, online);
  const [aAtualizar, setAAtualizar] = useState(false);
  const [orgCarregando, setOrgCarregando] = useState(visaoOrganizacao);
  const [orgErro, setOrgErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visaoOrganizacao || !orgCarregando) return;
    void recarregarEntregasOrganizacao()
      .catch((e) => setOrgErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setOrgCarregando(false));
  }, [orgCarregando, visaoOrganizacao]);

  if (!eEstafeta && !visaoOrganizacao) {
    return (
      <Ecra>
        <Titulo>Entregas</Titulo>
        <Texto>Aqui aparecem as entregas que fazes como estafeta.</Texto>
        <Texto suave>Os teus envios estão no separador Enviar.</Texto>
      </Ecra>
    );
  }
  if (estado.entregas === null || (visaoOrganizacao && orgCarregando)) return <EcraCarregamento texto="A abrir as entregas…" />;

  const porFazer = estado.entregas.filter((e) => !entregaTerminada(estadoEfetivo(e.estado, acoesDaEntrega(e, estado.acoes))));
  const feitas = estado.entregas.filter((e) => !porFazer.includes(e));
  const lista = [...porFazer, ...feitas];

  const atualizar = async () => {
    if (!userId) return;
    setAAtualizar(true);
    if (visaoOrganizacao) {
      setOrgCarregando(true);
      setOrgErro(null);
      await recarregarEntregasOrganizacao().catch((e) => setOrgErro(e instanceof Error ? e.message : String(e)));
      setOrgCarregando(false);
    } else {
      if (!userId) return;
      await recarregarEstafeta(userId, online === true).catch(() => undefined);
    }
    setAAtualizar(false);
  };

  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <FlatList
        data={lista}
        keyExtractor={(e) => e.id}
        contentContainerStyle={estilos.conteudo}
        refreshControl={online ? <RefreshControl refreshing={aAtualizar} onRefresh={() => void atualizar()} /> : undefined}
        ListHeaderComponent={
          <View style={estilos.cabecalho}>
            <Titulo>{visaoOrganizacao ? 'Entregas da organização' : 'As minhas entregas'}</Titulo>
            <Texto suave>{visaoOrganizacao ? `${estado.entregas.length} no total · ${porFazer.length} por fazer` : `${porFazer.length} por fazer`}</Texto>
            {orgErro ? <Caixa tipo="aviso">{`Não foi possível atualizar: ${orgErro}`}</Caixa> : null}
            {estado.aviso ? <Caixa tipo={estado.aviso.tipo}>{estado.aviso.texto}</Caixa> : null}
            {online === false ? <Caixa tipo="info">Sem rede: a mostrar o que está neste telemóvel. Podes continuar a trabalhar.</Caixa> : null}
            {estado.erro ? <Caixa tipo="aviso">{`Não foi possível atualizar: ${estado.erro}`}</Caixa> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={estilos.vazio}>
            <Texto>Não tens entregas atribuídas.</Texto>
          </View>
        }
        renderItem={({ item }) => (
          <ItemEntrega
            entrega={item}
            acoes={acoesDaEntrega(item, estado.acoes)}
            aoAbrir={() => {
              definirAvisoEstafeta(null);
              router.push({ pathname: '/minhas-entregas/[id]', params: { id: item.id } });
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: TAMANHOS.margem, gap: 12 },
  cabecalho: { gap: 12, marginBottom: 4 },
  vazio: { gap: 8, paddingVertical: 24 },
  item: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: TAMANHOS.raio,
    padding: 16,
    gap: 4,
    backgroundColor: CORES.fundo,
  },
  premido: { backgroundColor: CORES.fundoSuave },
  titulo: { fontSize: TAMANHOS.subtitulo, fontWeight: '700', color: CORES.texto },
  codigo: { fontSize: 17, fontWeight: '700', color: CORES.primaria },
  detalhe: { fontSize: TAMANHOS.textoPequeno, color: CORES.textoSuave },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  etiqueta: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: CORES.infoFundo,
    color: CORES.primaria,
  },
  etiquetaAviso: { backgroundColor: CORES.avisoFundo, color: CORES.avisoTexto },
  etiquetaErro: { backgroundColor: CORES.erroFundo, color: CORES.perigo },
});
