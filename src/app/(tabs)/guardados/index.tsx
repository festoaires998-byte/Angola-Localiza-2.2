import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Categorias } from '@/components/Categorias';
import { dataHora, NOMES_CATEGORIAS, nomeEstadoMorada, plural } from '@/components/nomes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Caixa, EcraCarregamento, Texto, Titulo } from '@/components/ui';
import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import { useMoradas } from '@/hooks/useMoradas';
import { useOnline } from '@/hooks/useOnline';
import { tituloMorada, type ItemMorada } from '@/services/moradas/moradas';

function ItemLista({ item, aoAbrir }: { item: ItemMorada; aoAbrir(): void }) {
  const m = item.morada;
  const titulo = tituloMorada(item);
  const sitio = [m?.municipio, m?.provincia].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${NOMES_CATEGORIAS[item.favorito.categoria]}`}
      onPress={aoAbrir}
      style={({ pressed }) => [estilos.item, pressed && estilos.premido]}
    >
      <Text style={estilos.titulo} numberOfLines={1}>
        {titulo}
      </Text>
      {item.favorito.nome && m?.codigo_postal ? <Text style={estilos.codigo}>{m.codigo_postal}</Text> : null}
      {sitio ? <Text style={estilos.detalhe}>{sitio}</Text> : null}
      <View style={estilos.etiquetas}>
        <Text style={estilos.etiqueta}>{NOMES_CATEGORIAS[item.favorito.categoria]}</Text>
        {m?.estado ? <Text style={[estilos.etiqueta, estilos.etiquetaEstado]}>{nomeEstadoMorada(m.estado)}</Text> : null}
        {item.favorito.pendente ? <Text style={[estilos.etiqueta, estilos.etiquetaPendente]}>À espera de rede</Text> : null}
      </View>
    </Pressable>
  );
}

export default function Moradas() {
  const online = useOnline();
  const moradas = useMoradas(online);
  const router = useRouter();
  const [categoria, setCategoria] = useState<CategoriaFavorito | null>(null);

  if (moradas.itens === null) return <EcraCarregamento texto="A abrir as moradas…" />;
  const lista = categoria ? moradas.itens.filter((i) => i.favorito.categoria === categoria) : moradas.itens;
  const vazia = moradas.itens.length === 0;

  return (
    <SafeAreaView style={estilos.ecra} edges={['top', 'left', 'right']}>
      <FlatList
        data={lista}
        keyExtractor={(i) => i.favorito.id}
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          online ? <RefreshControl refreshing={moradas.aAtualizar} onRefresh={() => void moradas.atualizar()} /> : undefined
        }
        ListHeaderComponent={
          <View style={estilos.cabecalho}>
            <Titulo>As minhas moradas</Titulo>
            {online === false ? (
              <Caixa tipo="info">
                {moradas.atualizadoEm
                  ? `Sem rede: a mostrar o que está neste telemóvel (atualizado a ${dataHora(moradas.atualizadoEm)}).`
                  : 'Sem rede: a mostrar o que está neste telemóvel.'}
              </Caixa>
            ) : null}
            {moradas.erro ? <Caixa tipo="aviso">{moradas.erro}</Caixa> : null}
            {moradas.pendentes > 0 ? (
              <Texto suave>{`${plural(moradas.pendentes, 'alteração', 'alterações')} à espera de rede para ir para o servidor.`}</Texto>
            ) : null}
            {!vazia ? <Categorias comTodas valor={categoria} aoEscolher={setCategoria} /> : null}
          </View>
        }
        ListEmptyComponent={
          vazia ? (
            <View style={estilos.vazio}>
              <Texto>{moradas.aAtualizar ? 'A procurar as tuas moradas…' : 'Ainda não tens moradas guardadas.'}</Texto>
              <Texto suave>
                Para já, as moradas guardam-se no site. Registar uma morada nova na app chega na próxima atualização.
              </Texto>
            </View>
          ) : (
            <View style={estilos.vazio}>
              <Texto>{`Sem moradas na categoria ${NOMES_CATEGORIAS[categoria!]}.`}</Texto>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ItemLista
            item={item}
            aoAbrir={() => router.push({ pathname: '/guardados/[id]', params: { id: item.favorito.id } })}
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
  etiquetaEstado: { backgroundColor: CORES.fundoSuave, color: CORES.textoSuave },
  etiquetaPendente: { backgroundColor: CORES.avisoFundo, color: CORES.avisoTexto },
});
