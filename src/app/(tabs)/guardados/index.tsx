import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Categorias } from '@/components/Categorias';
import { dataHora, NOMES_CATEGORIAS, nomeEstadoMorada, plural } from '@/components/nomes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, EcraCarregamento, Subtitulo, Texto, Titulo } from '@/components/ui';
import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import { nomeEstadoRegisto, type Registo } from '@/domain/enderecamento/meusRegistos';
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

const COR_ESTADO: Record<Registo['estado'], 'aviso' | 'info' | 'sucesso' | 'erro'> = {
  a_espera_rede: 'aviso',
  por_validar: 'info',
  aprovado: 'sucesso',
  rejeitado: 'erro',
  duplicado: 'erro',
};

/** Um registo (morada registada pela pessoa) e em que ponto está. */
function ItemRegisto({ registo }: { registo: Registo }) {
  const estado = nomeEstadoRegisto(registo);
  const titulo = registo.referencia || registo.tipo || 'Morada registada';
  return (
    <View style={estilos.registo} accessible accessibilityLabel={`${titulo}. ${estado}`}>
      <Text style={estilos.tituloRegisto} numberOfLines={2}>
        {registo.tipo && registo.referencia ? `${registo.tipo}: ${registo.referencia}` : titulo}
      </Text>
      {registo.bairro ? <Text style={estilos.detalhe}>{registo.bairro}</Text> : null}
      <Text style={[estilos.etiqueta, estilos[`estado_${COR_ESTADO[registo.estado]}`]]}>{estado}</Text>
      {registo.enviadoEm ? <Text style={estilos.detalhe}>{`Registada a ${dataHora(registo.enviadoEm)}`}</Text> : null}
    </View>
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
            <Botao titulo="Registar uma morada nova" onPress={() => router.push('/guardados/registar')} />
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
            {moradas.registos.length > 0 ? (
              <View style={estilos.registos}>
                <Subtitulo>Os meus registos</Subtitulo>
                <Texto suave>As moradas que registaste. Quando uma é aprovada, entra sozinha na lista abaixo.</Texto>
                {moradas.registos.map((r) => (
                  <ItemRegisto key={r.id} registo={r} />
                ))}
                <Subtitulo>Moradas guardadas</Subtitulo>
              </View>
            ) : null}
            {!vazia ? <Categorias comTodas valor={categoria} aoEscolher={setCategoria} /> : null}
          </View>
        }
        ListEmptyComponent={
          vazia ? (
            <View style={estilos.vazio}>
              <Texto>{moradas.aAtualizar ? 'A procurar as tuas moradas…' : 'Ainda não tens moradas guardadas.'}</Texto>
              <Texto suave>
                Regista a tua casa (ou outro local) com o botão acima. Fica à espera de validação; quando for aprovada,
                aparece aqui sozinha.
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
  registos: { gap: 8 },
  registo: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: TAMANHOS.raio,
    padding: 14,
    gap: 4,
    backgroundColor: CORES.fundoSuave,
  },
  tituloRegisto: { fontSize: TAMANHOS.texto, fontWeight: '700', color: CORES.texto },
  estado_aviso: { alignSelf: 'flex-start', backgroundColor: CORES.avisoFundo, color: CORES.avisoTexto },
  estado_info: { alignSelf: 'flex-start', backgroundColor: CORES.infoFundo, color: CORES.primaria },
  estado_sucesso: { alignSelf: 'flex-start', backgroundColor: '#E6F4EA', color: CORES.sucesso },
  estado_erro: { alignSelf: 'flex-start', backgroundColor: CORES.erroFundo, color: CORES.perigo },
});
