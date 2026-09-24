import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Botao, Caixa, Texto } from '../ui';

interface Props {
  /** Recebe o que o QR tem (uma só vez por abertura). */
  aoLer(conteudo: string): void;
  aoFechar(): void;
}

/** Leitor de QR Codes com a câmara de trás (como o "Ler QR" do site). Funciona sem rede. */
export function LeitorQr({ aoLer, aoFechar }: Props) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [recusada, setRecusada] = useState(false);
  const lido = useRef(false);

  useEffect(() => {
    if (permissao && !permissao.granted) {
      void pedirPermissao().then((p) => setRecusada(!p.granted));
    }
  }, [permissao?.granted]);

  if (recusada) {
    return (
      <View style={estilos.bloco}>
        <Caixa tipo="erro">Sem autorização para usar a câmara. Autoriza nas definições do telemóvel.</Caixa>
        <Botao titulo="Fechar" variante="secundario" onPress={aoFechar} />
      </View>
    );
  }

  return (
    <View style={estilos.bloco}>
      {permissao?.granted ? (
        <CameraView
          testID="leitor-qr"
          style={estilos.camara}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (lido.current || !data) return;
            lido.current = true;
            aoLer(data);
          }}
        />
      ) : null}
      <Texto suave>Aponta a câmara para o QR Code.</Texto>
      <Botao titulo="Cancelar" variante="secundario" onPress={aoFechar} />
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 8 },
  camara: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
});
