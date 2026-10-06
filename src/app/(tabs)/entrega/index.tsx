import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dataHora, plural } from '@/components/nomes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { nomeEstadoEntrega, type Envio } from '@/domain/entregas/envio';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { servicoEnvios } from '@/services/entregas/enviosApp';
import { definirAvisoEnvios, lojaEnvios, useEnvios } from '@/state/envios';
import { eventosSync } from '@/sync/eventos';
import { useRealtimeEntregas } from '@/hooks/useRealtimeEntregas';

function ItemEnvio({ envio, aoAbrir, aoUrgente }: { envio: Envio; aoAbrir(): void; aoUrgente(): void }) {
  const estado = nomeEstadoEntrega(envio.estado);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Envio para ${envio.destinatario}. ${estado}`}
      onPress={aoAbrir}
      style={({ pressed }) => [estilos.item, pressed && estilos.premido]}
    >
      <Text style={estilos.titulo} numberOfLines={1}>
        {envio.destinatario}
      </Text>
      {envio.codigo ? <Text style={estilos.codigo}>{`Rastreio: ${envio.codigo}`}</Text> : null}
      {envio.morada?.codigoPostal ? <Text style={estilos.detalhe}>{envio.morada.codigoPostal}</Text> : null}
      <View style={estilos.etiquetas}>
        <Text style={estilos.etiqueta}>{estado}</Text>
        {envio.urgente ? <Text style={[estilos.etiqueta, estilos.etiquetaUrgente]}>Urgente</Text> : null}
      </View>
      {!['DELIVERED', 'CANCELLED'].includes(envio.estado) ? (
        <Pressable onPress={aoUrgente} accessibilityRole="button" style={estilos.acaoUrgencia}>
          <Text style={estilos.acaoUrgenciaTexto}>{envio.urgente ? 'Desmarcar urgente' : '🔴 Marcar urgente'}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** Separador Enviar: os pedidos de entrega do utilizador e o botão para um novo. */
export default function Envios() {
  const online = useOnline();
  const userId = useSessao().utilizador?.id ?? null;
  const router = useRouter();
  const estado = useEnvios();
  const [aAtualizar, setAAtualizar] = useState(false);
  const [pesquisa, setPesquisa] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'ATIVOS' | 'DELIVERED' | 'CANCELLED' | 'FAILED'>('TODOS');

  const enviosVisiveis = (estado.envios ?? []).filter((e) => {
    const q = pesquisa.trim().toLocaleLowerCase();
    const correspondePesquisa = !q || [e.destinatario, e.codigo, e.morada?.codigoPostal, e.morada?.plusCode].filter(Boolean).some((v) => String(v).toLocaleLowerCase().includes(q));
    const correspondeEstado = filtroEstado === 'TODOS'
      || (filtroEstado === 'ATIVOS' && !['DELIVERED', 'CANCELLED'].includes(e.estado))
      || e.estado === filtroEstado;
    return correspondePesquisa && correspondeEstado;
  });

  const ler = useCallback(async () => {
    if (!userId) return;
    setAAtualizar(true);
    try {
      const [lista, porEnviar] = await Promise.all([
        servicoEnvios.listar(userId, online === true),
        servicoEnvios.porEnviar(userId).catch(() => []),
      ]);
      lojaEnvios.definir((e) => ({ ...e, envios: lista.envios, doServidor: lista.doServidor, erro: lista.erro, porEnviar }));
    } finally {
      setAAtualizar(false);
    }
  }, [userId, online]);

  useRealtimeEntregas(userId, 'criador', online === true, ler);

  useEffect(() => {
    void ler();
    // Um pedido feito sem rede sai pela fila: quando sai, a lista volta a ser lida.
    const pararA = eventosSync.ouvir('sincronizado', () => void ler());
    const pararB = eventosSync.ouvir('operacaoAcrescentada', () => void ler());
    return () => {
      pararA();
      pararB();
    };
  }, [ler]);

  if (estado.envios === null) return <EcraCarregamento texto="A abrir os envios…" />;

  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <FlatList
        data={enviosVisiveis}
        keyExtractor={(e) => e.id}
        contentContainerStyle={estilos.conteudo}
        refreshControl={online ? <RefreshControl refreshing={aAtualizar} onRefresh={() => void ler()} /> : undefined}
        ListHeaderComponent={
          <View style={estilos.cabecalho}>
            <Titulo>Os meus envios</Titulo>
            <Botao
              titulo="Novo envio"
              onPress={() => {
                definirAvisoEnvios(null);
                router.push('/entrega/novo');
              }}
            />
            {estado.aviso ? <Caixa tipo={estado.aviso.tipo}>{estado.aviso.texto}</Caixa> : null}
            <TextInput
              value={pesquisa}
              onChangeText={setPesquisa}
              placeholder="Pesquisar destinatário, rastreio ou destino"
              placeholderTextColor={CORES.textoSuave}
              accessibilityLabel="Pesquisar envios"
              style={estilos.pesquisa}
            />
            <View style={estilos.filtros}>
              {([
                ['TODOS', 'Todos'],
                ['ATIVOS', 'Ativos'],
                ['DELIVERED', 'Entregues'],
                ['CANCELLED', 'Cancelados'],
                ['FAILED', 'Falhados'],
              ] as const).map(([valor, titulo]) => (
                <Pressable
                  key={valor}
                  onPress={() => setFiltroEstado(valor)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filtroEstado === valor }}
                  style={[estilos.filtro, filtroEstado === valor && estilos.filtroAtivo]}
                >
                  <Text style={[estilos.filtroTexto, filtroEstado === valor && estilos.filtroTextoAtivo]}>{titulo}</Text>
                </Pressable>
              ))}
            </View>
            {online === false ? <Caixa tipo="info">Sem rede: a mostrar o que está neste telemóvel.</Caixa> : null}
            {estado.erro ? <Caixa tipo="aviso">{`Não foi possível atualizar: ${estado.erro}`}</Caixa> : null}
            {estado.porEnviar.length > 0 ? (
              <Caixa tipo="info">
                <Text style={estilos.textoCaixa}>
                  {`${plural(estado.porEnviar.length, 'pedido', 'pedidos')} à espera de rede para ir para o servidor:`}
                </Text>
                {estado.porEnviar.map((p) => (
                  <Text key={p.operationId} style={estilos.textoCaixa}>
                    {`• ${p.destinatario} (${dataHora(p.criadoEm)})${p.erro ? ` — ${p.erro}` : ''}`}
                  </Text>
                ))}
              </Caixa>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={estilos.vazio}>
            <Texto>{estado.envios.length > 0 && enviosVisiveis.length === 0 ? 'Nenhum envio corresponde aos filtros.' : aAtualizar ? 'A procurar os teus envios…' : 'Ainda não enviaste nada.'}</Texto>
            <Texto suave>
              Escolhe uma das tuas moradas guardadas como destino, escreve quem vai receber e envia. Recebes um
              código de rastreio e um PIN para dares a quem recebe.
            </Texto>
          </View>
        }
        renderItem={({ item }) => (
          <ItemEnvio
            envio={item}
            aoAbrir={() => {
              definirAvisoEnvios(null);
              router.push({ pathname: '/entrega/[id]', params: { id: item.id } });
            }}
            aoUrgente={() => {
              void servicoEnvios.definirUrgencia(item.id, !item.urgente).then(() => void ler()).catch((e) => definirAvisoEnvios({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível alterar a urgência.' }));
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundoEcra },
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
  textoCaixa: { fontSize: TAMANHOS.textoPequeno, lineHeight: 24, color: CORES.texto, fontWeight: '600' },
  pesquisa: { borderWidth: 1, borderColor: CORES.borda, borderRadius: TAMANHOS.raio, paddingHorizontal: 12, paddingVertical: 10, fontSize: TAMANHOS.texto, color: CORES.texto, backgroundColor: CORES.fundo },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filtro: { borderWidth: 1, borderColor: CORES.borda, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  filtroAtivo: { backgroundColor: CORES.infoFundo, borderColor: CORES.primaria },
  filtroTexto: { fontSize: 13, fontWeight: '700', color: CORES.textoSuave },
  filtroTextoAtivo: { color: CORES.primaria },
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
  etiquetaUrgente: { backgroundColor: CORES.avisoFundo, color: CORES.avisoTexto },
  acaoUrgencia: { alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderColor: CORES.borda, borderRadius: TAMANHOS.raio, paddingHorizontal: 10, paddingVertical: 7 },
  acaoUrgenciaTexto: { fontSize: 12, fontWeight: '700', color: CORES.textoSuave },
});
