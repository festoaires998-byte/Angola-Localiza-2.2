import { StyleSheet, Text, View } from 'react-native';

import { passosEntrega, type EstadoPasso } from '@/domain/entregas/linhaTempo';

import { type Cores } from './tema';
import { useEstilos } from './temaApp';

const SINAL: Record<EstadoPasso, string> = { feito: '✓', agora: '•', depois: '', falhou: '!', cancelado: '×' };
const LEITURA: Record<EstadoPasso, string> = {
  feito: 'feito',
  agora: 'passo atual',
  depois: 'ainda não',
  falhou: 'falhou',
  cancelado: 'cancelado',
};

/** Os passos da entrega com ✓, o passo atual em amarelo e uma linha a ligá-los. */
export function LinhaTempo({ estado }: { estado: string | null }) {
  const estilos = useEstilos(fabricaEstilos);
  const passos = passosEntrega(estado);
  return (
    <View accessibilityRole="list" testID="linha-tempo">
      {passos.map((p, i) => {
        const ultimo = i === passos.length - 1;
        return (
          <View key={p.nome} style={estilos.passo} accessible accessibilityLabel={`${p.nome}: ${LEITURA[p.estado]}${p.detalhe ? `. ${p.detalhe}` : ''}`}>
            <View style={estilos.coluna}>
              <View testID={`passo-${p.estado}`} style={[estilos.ponto, estilos[`ponto_${p.estado}`]]}>
                <Text style={[estilos.sinal, estilos[`sinal_${p.estado}`]]}>{SINAL[p.estado]}</Text>
              </View>
              {!ultimo ? <View style={[estilos.traco, p.estado === 'feito' && estilos.tracoFeito]} /> : null}
            </View>
            <View style={estilos.textos}>
              <Text style={[estilos.nome, p.estado === 'depois' && estilos.nomeDepois]}>{p.nome}</Text>
              {p.detalhe ? <Text style={estilos.detalhe}>{p.detalhe}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  passo: { flexDirection: 'row', gap: 14, minHeight: 58 },
  coluna: { alignItems: 'center', width: 30 },
  ponto: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ponto_feito: { backgroundColor: CORES.primaria },
  ponto_agora: { backgroundColor: CORES.destaque, borderWidth: 5, borderColor: CORES.destaqueFundo, width: 34, height: 34, borderRadius: 17 },
  ponto_depois: { backgroundColor: CORES.fundoSuave, borderWidth: 2, borderColor: CORES.borda },
  ponto_falhou: { backgroundColor: CORES.perigo },
  ponto_cancelado: { backgroundColor: CORES.inativo },
  sinal: { fontSize: 15, fontWeight: '800' },
  sinal_feito: { color: CORES.sobrePrimaria },
  sinal_agora: { color: CORES.sobreDestaque },
  sinal_depois: { color: CORES.texto },
  sinal_falhou: { color: CORES.fundo },
  sinal_cancelado: { color: CORES.fundo },
  traco: { flex: 1, width: 3, borderRadius: 2, backgroundColor: CORES.bordaCartao, marginVertical: 2 },
  tracoFeito: { backgroundColor: CORES.primaria },
  textos: { flex: 1, paddingBottom: 14, gap: 2 },
  nome: { fontSize: 17, fontWeight: '800', color: CORES.texto },
  nomeDepois: { color: CORES.textoSuave, fontWeight: '600' },
  detalhe: { fontSize: 15, fontWeight: '600', color: CORES.textoSuave },
});
