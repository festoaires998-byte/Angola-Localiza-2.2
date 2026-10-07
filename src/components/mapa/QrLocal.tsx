import { useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { linkGoogleMaps, textoPartilhaLocal } from '@/domain/enderecamento/pesquisa';
import { partilharQrPng } from '@/services/imagem/qrPng';

import { type Cores } from '../tema';
import { useEstilos } from '../temaApp';
import { Botao, Caixa } from '../ui';

interface Props {
  latitude: number;
  longitude: number;
  plusCode: string;
  codigoPostal: string | null;
}

/** "QR Code · abre no Google Maps", com Guardar e Partilhar (como no site). Funciona sem rede. */
export function QrLocal({ latitude, longitude, plusCode, codigoPostal }: Props) {
  const estilos = useEstilos(fabricaEstilos);
  const qr = useRef<{ toDataURL(cb: (base64: string) => void): void } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const link = linkGoogleMaps(latitude, longitude);

  const guardar = () => {
    setErro(null);
    if (!qr.current) return setErro('O QR Code ainda não está pronto. Tenta outra vez.');
    qr.current.toDataURL((base64) => {
      partilharQrPng(base64, 'codigo-postal-angola-localiza.png').catch((e: unknown) =>
        setErro(e instanceof Error ? e.message : String(e)),
      );
    });
  };

  const partilhar = () => {
    setErro(null);
    void Share.share({ message: textoPartilhaLocal({ latitude, longitude, plusCode, codigoPostal }) }).catch(() => undefined);
  };

  return (
    <View style={estilos.bloco}>
      <Text style={estilos.rotulo}>QR Code · abre no Google Maps</Text>
      <View style={estilos.caixaQr} accessible accessibilityLabel={`QR Code com o link ${link}`}>
        <QRCode
          value={link}
          size={160}
          color="#181818"
          backgroundColor="#FFFFFF"
          quietZone={8}
          getRef={(c) => {
            qr.current = c;
          }}
        />
      </View>
      <View style={estilos.linha}>
        <View style={estilos.metade}>
          <Botao titulo="Guardar" variante="secundario" onPress={guardar} />
        </View>
        <View style={estilos.metade}>
          <Botao titulo="Partilhar" variante="secundario" onPress={partilhar} />
        </View>
      </View>
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
    </View>
  );
}

const fabricaEstilos = (CORES: Cores) => StyleSheet.create({
  bloco: { gap: 8 },
  rotulo: { fontSize: 15, color: CORES.textoSuave },
  caixaQr: { alignSelf: 'center', padding: 4, backgroundColor: '#FFFFFF', borderRadius: 8 },
  linha: { flexDirection: 'row', gap: 8 },
  metade: { flex: 1 },
});
