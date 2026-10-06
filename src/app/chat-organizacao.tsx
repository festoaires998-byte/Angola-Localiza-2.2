import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import { enviarMensagemChat, listarCanaisOrganizacao, listarMensagensChat, type CanalOrganizacao, type MensagemChat } from '@/services/chat/organizacao';

export default function ChatOrganizacao() {
  const params = useLocalSearchParams<{ tipo?: string; chave?: string; titulo?: string }>();
  const tipo = String(params.tipo || 'ORG_ESTAFETA');
  const chave = params.chave ? String(params.chave) : null;
  const tituloParam = params.titulo ? String(params.titulo) : null;
  const [canais, setCanais] = useState<CanalOrganizacao[] | null>(null);
  const [canal, setCanal] = useState<CanalOrganizacao | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aAtualizar, setAAtualizar] = useState(false);

  async function carregarCanais() {
    if (chave) {
      setCanais([{ conversation_type: tipo, conversation_key: chave, titulo: tituloParam || 'Chat da entrega' }]);
      setCanal({ conversation_type: tipo, conversation_key: chave, titulo: tituloParam || 'Chat da entrega' });
      return;
    }
    setErro(null);
    try {
      const todos = await listarCanaisOrganizacao();
      const filtrados = todos.filter((c) => c.conversation_type === tipo);
      setCanais(filtrados);
      if (filtrados.length === 1) setCanal(filtrados[0]);
      else if (filtrados.length === 0) setErro('Não encontrei nenhum canal deste tipo.');
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  async function carregarMensagens(c: CanalOrganizacao) {
    try {
      const r = await listarMensagensChat(c.conversation_type, c.conversation_key);
      setMensagens(r.messages);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  useEffect(() => { void carregarCanais(); }, [tipo]);
  useEffect(() => {
    if (!canal) return;
    void carregarMensagens(canal);
    const timer = setInterval(() => { void carregarMensagens(canal); }, 6000);
    return () => clearInterval(timer);
  }, [canal]);

  const titulo = useMemo(() => canal?.titulo || 'Falar com a organização', [canal]);
  if (!canais && !erro) return <EcraCarregamento texto="A procurar canais…" />;

  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <FlatList
        data={mensagens}
        keyExtractor={(m) => m.id}
        inverted={false}
        refreshControl={<RefreshControl refreshing={aAtualizar} onRefresh={async () => { setAAtualizar(true); if (canal) await carregarMensagens(canal); else await carregarCanais(); setAAtualizar(false); }} />}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <View style={estilos.cabecalho}>
            <Titulo>{titulo}</Titulo>
            {canais && canais.length > 1 ? <View style={estilos.canais}>{canais.map((c) => <Pressable key={c.conversation_key} onPress={() => setCanal(c)} style={[estilos.canal, canal?.conversation_key === c.conversation_key && estilos.canalAtivo]}><Text style={estilos.canalTexto}>{c.titulo}</Text></Pressable>)}</View> : null}
            {erro ? <Caixa tipo="aviso">{erro}</Caixa> : null}
            {!canal && canais?.length === 0 ? <Texto suave>Não há um canal de comunicação disponível para esta conta.</Texto> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[estilos.mensagem, item.sou_eu ? estilos.minha : estilos.outra]}>
            {!item.sou_eu ? <Text style={estilos.remetente}>{item.sender_email || 'Organização'}</Text> : null}
            <Text style={estilos.corpo}>{item.body || '📎 Anexo'}</Text>
            <Text style={estilos.data}>{new Date(item.created_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        )}
        ListEmptyComponent={canal ? <Texto suave>Ainda sem mensagens.</Texto> : null}
      />
      {canal ? (
        <View style={estilos.compositor}>
          <TextInput value={texto} onChangeText={setTexto} placeholder="Escreve uma mensagem…" placeholderTextColor={CORES.textoSuave} style={estilos.input} multiline />
          <Botao titulo="Enviar" onPress={async () => {
            const body = texto.trim();
            if (!body) return;
            setTexto('');
            try { await enviarMensagemChat(canal.conversation_type, canal.conversation_key, body); await carregarMensagens(canal); }
            catch (e) { Alert.alert('Chat', e instanceof Error ? e.message : 'Não foi possível enviar.'); setTexto(body); }
          }} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundoEcra },
  lista: { padding: TAMANHOS.margem, gap: 10, paddingBottom: 16 },
  cabecalho: { gap: 10, marginBottom: 8 },
  canais: { gap: 8 },
  canal: { borderWidth: 1, borderColor: CORES.borda, borderRadius: TAMANHOS.raio, padding: 12 },
  canalAtivo: { borderColor: CORES.primaria, backgroundColor: CORES.infoFundo },
  canalTexto: { color: CORES.texto, fontWeight: '700' },
  mensagem: { maxWidth: '84%', borderRadius: TAMANHOS.raio, padding: 10, gap: 4 },
  minha: { alignSelf: 'flex-end', backgroundColor: CORES.infoFundo },
  outra: { alignSelf: 'flex-start', backgroundColor: CORES.fundoSuave },
  remetente: { fontSize: 11, color: CORES.textoSuave },
  corpo: { fontSize: 15, color: CORES.texto },
  data: { fontSize: 10, color: CORES.textoSuave },
  compositor: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: CORES.borda },
  input: { minHeight: 44, maxHeight: 110, borderWidth: 1, borderColor: CORES.borda, borderRadius: TAMANHOS.raio, padding: 10, color: CORES.texto, backgroundColor: CORES.fundo },
});
