// Diagnóstico (Definições → Diagnóstico): testa as peças do telemóvel.
// Útil para o suporte no terreno: o utilizador pode ler ou copiar os resultados.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CORES } from '@/components/tema';
import { Botao } from '@/components/ui';

import {
  mensagemDeErro,
  VERIFICACOES,
  type Verificacao,
} from '@/services/diagnostico/verificacoes';

type Resultado =
  | { estado: 'a correr' }
  | { estado: 'ok'; texto: string }
  | { estado: 'erro'; texto: string };

const ICONE: Record<Resultado['estado'], string> = {
  'a correr': '⏳',
  ok: '✅',
  erro: '❌',
};

export default function Diagnostico() {
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});

  const correr = useCallback(async (verificacao: Verificacao) => {
    const guardar = (r: Resultado) => setResultados((atual) => ({ ...atual, [verificacao.id]: r }));
    guardar({ estado: 'a correr' });
    try {
      guardar({ estado: 'ok', texto: await verificacao.correr() });
    } catch (erro) {
      guardar({ estado: 'erro', texto: mensagemDeErro(erro) });
    }
  }, []);

  const correrTodas = useCallback(async () => {
    // Uma de cada vez: o pedido de permissão do GPS não fica por cima das outras.
    for (const verificacao of VERIFICACOES) await correr(verificacao);
  }, [correr]);

  useEffect(() => {
    void correrTodas();
  }, [correrTodas]);

  return (
    <View style={styles.ecra}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.titulo}>Se o suporte pedir, tira uma captura deste ecrã.</Text>
        <Botao titulo="Testar tudo outra vez" onPress={() => void correrTodas()} />
        {VERIFICACOES.map((verificacao) => {
          const r = resultados[verificacao.id];
          return (
            <View key={verificacao.id} style={styles.cartao}>
              <Text style={styles.nome}>
                {r ? ICONE[r.estado] : '•'} {verificacao.titulo}
              </Text>
              {r && r.estado !== 'a correr' ? (
                <Text selectable style={r.estado === 'erro' ? styles.erro : styles.texto}>
                  {r.texto}
                </Text>
              ) : null}
              <Botao
                titulo="Testar"
                variante="secundario"
                desativado={r?.estado === 'a correr'}
                onPress={() => void correr(verificacao)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { fontSize: 16, color: CORES.textoSuave },
  cartao: { borderWidth: 1, borderColor: CORES.borda, borderRadius: 12, padding: 12, gap: 8 },
  nome: { fontSize: 18, fontWeight: '700', color: CORES.texto },
  texto: { fontSize: 16, color: CORES.texto },
  erro: { fontSize: 16, color: CORES.perigo },
});
