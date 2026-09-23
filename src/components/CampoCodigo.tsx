import { StyleSheet, Text, TextInput, View } from 'react-native';

import { CORES, TAMANHOS } from './tema';

/** Caixa grande para os 6 dígitos do código da app de autenticação. */
export function CampoCodigo({
  valor,
  aoMudar,
  aoCompletar,
}: {
  valor: string;
  aoMudar(v: string): void;
  aoCompletar?(codigo: string): void;
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>Código de 6 dígitos</Text>
      <TextInput
        accessibilityLabel="Código de 6 dígitos"
        value={valor}
        onChangeText={(texto) => {
          const digitos = texto.replace(/\D/g, '').slice(0, 6);
          aoMudar(digitos);
          if (digitos.length === 6) aoCompletar?.(digitos);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor={CORES.inativo}
        style={estilos.entrada}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  campo: { gap: 6 },
  rotulo: { fontSize: TAMANHOS.textoPequeno, fontWeight: '600', color: CORES.texto },
  entrada: {
    minHeight: 72,
    borderWidth: 2,
    borderColor: CORES.borda,
    borderRadius: TAMANHOS.raio,
    fontSize: 34,
    letterSpacing: 10,
    textAlign: 'center',
    fontWeight: '700',
    color: CORES.texto,
  },
});
