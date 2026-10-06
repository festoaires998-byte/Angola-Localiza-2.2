import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import { VISIBILIDADES, type Visibilidade } from '@/services/moradas/moradas';

import { NOMES_CATEGORIAS, nomeVisibilidade } from '../nomes';
import { Opcoes } from '../Opcoes';
import { type Cores } from '../tema';
import { useEstilos } from '../temaApp';
import { Botao, Caixa, vibrarSucesso } from '../ui';

/** A mesma ordem do site: "Outro" primeiro. */
const CATEGORIAS: readonly CategoriaFavorito[] = ['outro', 'casa', 'trabalho', 'familia', 'cliente', 'loja', 'entrega'];

interface Props {
  /** null = pode guardar; senão, porque não pode (ex.: sem posição boa). */
  bloqueio: string | null;
  /** Já guardado este ponto (evita guardar duas vezes o mesmo). */
  guardado: boolean;
  aoGuardar(escolhas: { visibilidade: Visibilidade; categoria: CategoriaFavorito }): Promise<string>;
}

/** Privacidade, Categoria e "Guardar como favorito" (como no fundo do Mapa do site). */
export function GuardarFavorito({ bloqueio, guardado, aoGuardar }: Props) {
  const estilos = useEstilos(fabricaEstilos);
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('PUBLIC');
  const [categoria, setCategoria] = useState<CategoriaFavorito>('outro');
  const [aGuardar, setAGuardar] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  const guardar = async () => {
    setAGuardar(true);
    setMensagem(null);
    try {
      setMensagem({ tipo: 'sucesso', texto: await aoGuardar({ visibilidade, categoria }) });
      vibrarSucesso();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <View style={estilos.bloco}>
      <Text style={estilos.rotulo}>Privacidade</Text>
      <Opcoes<Visibilidade>
        grupo="Privacidade"
        empilhadas
        opcoes={VISIBILIDADES.map((v) => ({ valor: v, nome: nomeVisibilidade(v) }))}
        valor={visibilidade}
        aoEscolher={setVisibilidade}
      />
      <Text style={estilos.rotulo}>Categoria</Text>
      <Opcoes<CategoriaFavorito>
        grupo="Categoria"
        opcoes={CATEGORIAS.map((c) => ({ valor: c, nome: NOMES_CATEGORIAS[c] }))}
        valor={categoria}
        aoEscolher={setCategoria}
      />
      {bloqueio ? <Text style={estilos.nota}>{bloqueio}</Text> : null}
      <Botao
        titulo={guardado ? 'Guardado como favorito ✓' : 'Guardar como favorito'}
        variante="secundario"
        onPress={() => void guardar()}
        desativado={!!bloqueio || guardado}
        aCarregar={aGuardar}
      />
      {mensagem ? <Caixa tipo={mensagem.tipo}>{mensagem.texto}</Caixa> : null}
    </View>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  bloco: { gap: 8 },
  rotulo: { fontSize: 17, fontWeight: '700', color: CORES.texto, marginTop: 4 },
  nota: { fontSize: 15, lineHeight: 21, color: CORES.textoSuave },
});
