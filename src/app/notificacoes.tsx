import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TAMANHOS, type Cores } from '@/components/tema';
import { useEstilos } from '@/components/temaApp';
import { Botao, Caixa, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { useSessao } from '@/hooks/useSessao';
import { listarNotificacoes, marcarNotificacaoComoLida, marcarTodasNotificacoesComoLidas, subscreverNotificacoesRealtime, type Notificacao } from '@/services/notificacoes/notificacoes';

function formatarData(valor: string): string {
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

export default function Notificacoes() {
  const estilos = useEstilos(fabricaEstilos);
  const estado = useSessao();
  const router = useRouter();
  const [itens, setItens] = useState<Notificacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aAtualizar, setAAtualizar] = useState(false);

  const atualizar = useCallback(async () => {
    setErro(null); setAAtualizar(true);
    try { setItens(await listarNotificacoes()); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setAAtualizar(false); }
  }, []);

  useEffect(() => { if (!estado.utilizador) return; void atualizar(); return subscreverNotificacoesRealtime(estado.utilizador.id, (nova) => setItens((atual) => [nova, ...(atual ?? [])].slice(0, 50))); }, [estado.utilizador, atualizar]);
  if (!estado.carregado) return <EcraCarregamento />;
  if (!estado.utilizador) return <Redirect href="/entrar" />;

  const naoLidas = (itens ?? []).filter((n) => !n.read_at).length;
  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      {itens === null && !erro ? <EcraCarregamento texto="A abrir notificações…" /> : (
        <FlatList
          data={itens ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={aAtualizar} onRefresh={() => void atualizar()} />}
          contentContainerStyle={estilos.conteudo}
          ListHeaderComponent={<View style={estilos.cabecalho}>
            <Botao titulo="Voltar" variante="secundario" onPress={() => router.back()} />
            <Titulo>Notificações</Titulo>
            {naoLidas > 0 ? <Botao titulo={'Marcar todas como lidas (' + naoLidas + ')'} onPress={async () => { await marcarTodasNotificacoesComoLidas(); await atualizar(); }} /> : <Texto suave>Não tens notificações por ler.</Texto>}
            {erro ? <Caixa tipo="aviso">{erro}</Caixa> : null}
          </View>}
          ListEmptyComponent={<View style={estilos.vazio}><Texto>Ainda não tens notificações.</Texto><Texto suave>Novos avisos de entregas, Campo, validações e outros eventos aparecerão aqui.</Texto></View>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={item.title}
              onPress={async () => { if (!item.read_at) { await marcarNotificacaoComoLida(item.id); setItens((atual) => atual?.map((n) => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n) ?? null); } }}
              style={[estilos.item, !item.read_at && estilos.naoLida]}>
              <Text style={estilos.titulo}>{item.title}</Text>
              {item.body ? <Text style={estilos.corpo}>{item.body}</Text> : null}
              <Text style={estilos.data}>{formatarData(item.created_at)}{item.read_at ? ' · Lida' : ' · Não lida'}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundoEcra },
  conteudo: { padding: TAMANHOS.margem, gap: 12 },
  cabecalho: { gap: 10, marginBottom: 4 },
  item: { borderWidth: 1, borderColor: CORES.borda, borderRadius: TAMANHOS.raio, padding: 14, gap: 6, backgroundColor: CORES.fundo },
  naoLida: { borderColor: CORES.primaria, backgroundColor: CORES.fundoSuave },
  titulo: { fontSize: 17, fontWeight: '700', color: CORES.texto },
  corpo: { fontSize: 15, lineHeight: 21, color: CORES.texto },
  data: { fontSize: 13, color: CORES.textoSuave },
  vazio: { paddingVertical: 24, gap: 8 },
});
