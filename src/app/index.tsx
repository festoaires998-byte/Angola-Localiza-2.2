// Ecrã PROVISÓRIO de diagnóstico do primeiro build no telemóvel.
// Vai ser substituído pelos ecrãs a sério.
import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    <SafeAreaView style={styles.ecra}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.titulo}>Angola Localiza — diagnóstico</Text>
        <Button title="Testar tudo outra vez" onPress={() => void correrTodas()} />
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
              <Button
                title="Testar"
                disabled={r?.estado === 'a correr'}
                onPress={() => void correr(verificacao)}
              />
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ecra: { flex: 1, backgroundColor: '#fff' },
  conteudo: { padding: 16, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '600', color: '#000' },
  cartao: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, gap: 8 },
  nome: { fontSize: 16, fontWeight: '600', color: '#000' },
  texto: { fontSize: 14, color: '#222' },
  erro: { fontSize: 14, color: '#b00020' },
});
