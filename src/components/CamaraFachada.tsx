import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Botao, Caixa, Texto } from './ui';

interface Props {
  /** URI da foto já pronta (com marca de água), para mostrar. */
  foto: string | null;
  /** Pode abrir a câmara? (ex.: só depois de medir a posição) */
  podeFotografar: boolean;
  motivoSemCamara?: string;
  /** Recebe a foto da câmara e devolve quando a foto final estiver pronta (ou falha com a mensagem). */
  aoFotografar(uriCamara: string): Promise<void>;
  aoApagar(): void;
}

/** Foto da fachada tirada na hora, pela câmara (nunca da galeria, como no site). */
export function CamaraFachada({ foto, podeFotografar, motivoSemCamara, aoFotografar, aoApagar }: Props) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [aberta, setAberta] = useState(false);
  const [aTirar, setATirar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const camara = useRef<CameraView>(null);

  if (foto) {
    return (
      <View style={estilos.bloco}>
        <Image source={{ uri: foto }} style={estilos.foto} accessibilityLabel="Foto da fachada" resizeMode="cover" />
        <Botao titulo="Tirar outra foto" variante="secundario" onPress={aoApagar} />
      </View>
    );
  }

  if (!aberta) {
    return (
      <View style={estilos.bloco}>
        {!podeFotografar && motivoSemCamara ? <Texto suave>{motivoSemCamara}</Texto> : null}
        <Botao
          titulo="Abrir a câmara"
          desativado={!podeFotografar}
          onPress={async () => {
            setErro(null);
            const p = permissao?.granted ? permissao : await pedirPermissao();
            if (p.granted) setAberta(true);
            else setErro('Sem autorização para usar a câmara. Autoriza nas definições do telemóvel.');
          }}
        />
        {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
      </View>
    );
  }

  const tirar = async () => {
    setATirar(true);
    setErro(null);
    try {
      const r = await camara.current?.takePictureAsync({ quality: 0.9 });
      if (!r?.uri) throw new Error('A câmara não devolveu a foto. Tenta outra vez.');
      await aoFotografar(r.uri);
      setAberta(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setATirar(false);
    }
  };

  return (
    <View style={estilos.bloco}>
      <CameraView ref={camara} style={estilos.camara} facing="back" testID="camara-fachada" />
      <Botao titulo="Tirar foto" onPress={() => void tirar()} aCarregar={aTirar} />
      <Botao titulo="Cancelar" variante="secundario" onPress={() => setAberta(false)} desativado={aTirar} />
      {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 10 },
  camara: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden' },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
});
