import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Cores } from './tema';
import { useEstilos } from './temaApp';

export interface Opcao<T extends string> {
  valor: T;
  nome: string;
  /** Texto por baixo do nome (ex.: o código de uma célula). */
  detalhe?: string;
}

interface Props<T extends string> {
  /** Nome do grupo, lido pelo leitor de ecrã antes de cada opção (ex.: "Tipo de local"). */
  grupo: string;
  opcoes: readonly Opcao<T>[];
  valor: T | null;
  aoEscolher(valor: T): void;
  /** Uma por linha (a toda a largura), em vez de lado a lado. */
  empilhadas?: boolean;
}

/** Botões grandes para escolher uma opção (a escolhida fica azul). */
export function Opcoes<T extends string>({ grupo, opcoes, valor, aoEscolher, empilhadas = false }: Props<T>) {
  const estilos = useEstilos(fabricaEstilos);
  return (
    <View style={[estilos.grupo, empilhadas && estilos.empilhadas]} accessibilityRole="radiogroup">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="radio"
            accessibilityLabel={`${grupo}: ${o.nome}${o.detalhe ? `, ${o.detalhe}` : ''}`}
            accessibilityState={{ selected: ativo, checked: ativo }}
            onPress={() => aoEscolher(o.valor)}
            style={[estilos.botao, empilhadas && estilos.botaoLargo, ativo && estilos.ativo]}
          >
            <Text style={[estilos.nome, ativo && estilos.textoAtivo]}>{o.nome}</Text>
            {o.detalhe ? <Text style={[estilos.detalhe, ativo && estilos.textoAtivo]}>{o.detalhe}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  grupo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empilhadas: { flexDirection: 'column' },
  botao: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: CORES.primaria,
    backgroundColor: CORES.fundo,
  },
  botaoLargo: { alignSelf: 'stretch' },
  ativo: { backgroundColor: CORES.primaria },
  nome: { fontSize: 16, fontWeight: '700', color: CORES.primaria },
  detalhe: { fontSize: 15, fontWeight: '600', color: CORES.texto, marginTop: 2 },
  textoAtivo: { color: CORES.sobrePrimaria },
});
