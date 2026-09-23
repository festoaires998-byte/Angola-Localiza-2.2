import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { lerDadosMorada } from '@/api/moradasNucleo';
import { Categorias } from '@/components/Categorias';
import { dataHora, nomeEstadoMorada, nomeVisibilidade, textoPrecisao } from '@/components/nomes';
import { CORES, TAMANHOS } from '@/components/tema';
import { Botao, Caixa, Campo, Cartao, EcraCarregamento, Linha, Subtitulo, Texto } from '@/components/ui';
import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import { useMoradas } from '@/hooks/useMoradas';
import { useOnline } from '@/hooks/useOnline';
import { tituloMorada } from '@/services/moradas/moradas';

/** Texto para partilhar: código, Plus Code e link do mapa. */
function textoPartilha(codigo: string | null, plusCode: string | null, lat: number, lng: number): string {
  return [
    codigo ? `Código Postal Digital: ${codigo}` : null,
    plusCode ? `Plus Code: ${plusCode}` : null,
    `Mapa: https://www.google.com/maps?q=${lat},${lng}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export default function DetalheMorada() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const moradas = useMoradas(online, { atualizarAoAbrir: false });
  const router = useRouter();
  const item = moradas.itens?.find((i) => i.favorito.id === id) ?? null;

  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<CategoriaFavorito>('outro');
  const [aGuardar, setAGuardar] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Preenche o formulário com o que está guardado (só quando muda de morada).
  useEffect(() => {
    if (item) {
      setNome(item.favorito.nome);
      setCategoria(item.favorito.categoria);
    }
  }, [item?.favorito.id]);

  if (moradas.itens === null) return <EcraCarregamento texto="A abrir a morada…" />;
  if (!item) {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Texto>Esta morada já não está nas tuas moradas guardadas.</Texto>
        <Botao titulo="Voltar" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const m = item.morada;
  const dados = lerDadosMorada(m?.dados);
  const codigo = m?.codigo_postal ?? null;
  const mudou = nome.trim() !== item.favorito.nome || categoria !== item.favorito.categoria;
  const precisao = textoPrecisao(m?.precisao_m ?? null);

  const guardar = async () => {
    setAGuardar(true);
    setMensagem(null);
    try {
      await moradas.alterar(item.favorito.id, { nome, categoria });
      setMensagem({
        tipo: 'sucesso',
        texto: online ? 'Alteração guardada.' : 'Guardado neste telemóvel. Vai para o servidor quando houver rede.',
      });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setAGuardar(false);
    }
  };

  const copiar = async () => {
    if (!codigo) return;
    await Clipboard.setStringAsync(codigo);
    setCopiado(true);
  };

  const partilhar = () => {
    if (!m) return;
    void Share.share({ message: textoPartilha(codigo, m.plus_code, m.latitude, m.longitude) });
  };

  const remover = () => {
    Alert.alert(
      'Tirar das moradas guardadas?',
      'A morada continua a existir; só deixa de aparecer na tua lista.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Tirar',
          style: 'destructive',
          onPress: () => {
            void moradas.remover(item.favorito.id).then(() => router.back());
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Subtitulo>{tituloMorada(item)}</Subtitulo>
        <View style={estilos.bloco}>
          <Text style={estilos.rotulo}>Código Postal Digital</Text>
          <Text selectable style={estilos.codigo} accessibilityLabel="Código Postal Digital">
            {codigo ?? 'Sem código'}
          </Text>
        </View>
        {codigo ? (
          <Botao titulo={copiado ? 'Código copiado ✓' : 'Copiar código'} variante="secundario" onPress={() => void copiar()} />
        ) : null}
        {m ? <Botao titulo="Partilhar" variante="secundario" onPress={partilhar} /> : null}
      </Cartao>

      <Cartao>
        <Linha nome="Plus Code" valor={m?.plus_code ?? '—'} />
        <Linha nome="Município" valor={m?.municipio ?? '—'} />
        <Linha nome="Província" valor={m?.provincia ?? '—'} />
        {dados.referencia ? <Linha nome="Referência" valor={dados.referencia} /> : null}
        {dados.numero_porta ? <Linha nome="Número da porta" valor={dados.numero_porta} /> : null}
        <Linha nome="Estado" valor={nomeEstadoMorada(m?.estado ?? null)} />
        <Linha nome="Quem pode ver" valor={nomeVisibilidade(dados.visibilidade)} />
        {m ? <Linha nome="Coordenadas" valor={`${m.latitude.toFixed(6)}, ${m.longitude.toFixed(6)}`} /> : null}
        {m?.precisao_m !== null && m?.precisao_m !== undefined ? (
          <Linha nome="Precisão do GPS ao registar" valor={precisao.texto} />
        ) : null}
        {dados.criada_em ? <Linha nome="Registada a" valor={dataHora(dados.criada_em)} /> : null}
      </Cartao>

      <Cartao>
        <Subtitulo>Nome e categoria</Subtitulo>
        <Campo
          rotulo="Nome (opcional, ex.: Casa da avó)"
          value={nome}
          onChangeText={(t) => {
            setNome(t);
            setMensagem(null);
          }}
          maxLength={60}
        />
        <Text style={estilos.rotulo}>Categoria</Text>
        <Categorias
          valor={categoria}
          aoEscolher={(c) => {
            if (c) setCategoria(c);
            setMensagem(null);
          }}
        />
        {item.favorito.pendente === 'atualizar' && !mudou ? (
          <Texto suave>Alteração guardada neste telemóvel, à espera de rede.</Texto>
        ) : null}
        {mensagem ? <Caixa tipo={mensagem.tipo}>{mensagem.texto}</Caixa> : null}
        <Botao titulo="Guardar alterações" onPress={() => void guardar()} desativado={!mudou} aCarregar={aGuardar} />
      </Cartao>

      <Botao titulo="Tirar das moradas guardadas" variante="perigo" onPress={remover} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: TAMANHOS.margem, gap: 12 },
  bloco: { gap: 2 },
  rotulo: { fontSize: 15, color: CORES.textoSuave },
  codigo: { fontSize: 24, fontWeight: '700', color: CORES.texto },
});
