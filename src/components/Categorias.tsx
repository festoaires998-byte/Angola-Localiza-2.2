import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { CATEGORIAS_FAVORITO, type CategoriaFavorito } from '@/database/repositories/favoritos';

import { NOMES_CATEGORIAS } from './nomes';
import { type Cores } from './tema';
import { useEstilos } from './temaApp';

interface Props {
  valor: CategoriaFavorito | null;
  aoEscolher(categoria: CategoriaFavorito | null): void;
  /** Mostra também "Todas" (para filtrar a lista). */
  comTodas?: boolean;
}

/** Botões das categorias, numa linha que se arrasta para o lado. */
export function Categorias({ valor, aoEscolher, comTodas = false }: Props) {
  const estilos = useEstilos(fabricaEstilos);
  const opcoes: (CategoriaFavorito | null)[] = comTodas ? [null, ...CATEGORIAS_FAVORITO] : [...CATEGORIAS_FAVORITO];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.linha}>
      {opcoes.map((c) => {
        const ativo = c === valor;
        const nome = c ? NOMES_CATEGORIAS[c] : 'Todas';
        return (
          <Pressable
            key={c ?? 'todas'}
            accessibilityRole="button"
            accessibilityLabel={`Categoria: ${nome}`}
            accessibilityState={{ selected: ativo }}
            onPress={() => aoEscolher(c)}
            style={[estilos.botao, ativo && estilos.ativo]}
          >
            <Text style={[estilos.texto, ativo && estilos.textoAtivo]}>{nome}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  linha: { gap: 8, paddingVertical: 4 },
  botao: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: CORES.primaria,
    backgroundColor: CORES.fundo,
  },
  ativo: { backgroundColor: CORES.primaria },
  texto: { fontSize: 16, fontWeight: '700', color: CORES.primaria },
  textoAtivo: { color: CORES.sobrePrimaria },
});
