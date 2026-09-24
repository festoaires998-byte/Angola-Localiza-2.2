import { ImageFormat, matchFont, Skia } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { gerarUuid } from '@/database/ids';

import { sha256Hex } from './hashFoto';
import { desenhoMarca, LARGURA_FOTO, QUALIDADE_JPEG } from './marcaDeAgua';

export interface FotoComMarca {
  /** Ficheiro final na pasta de documentos (o sistema não o apaga, ao contrário da cache). */
  uri: string;
  sha256: string;
  tamanhoBytes: number;
}

/**
 * Pega na foto da câmara, reduz para 1280 px de largura, desenha a faixa com
 * a marca de água (Plus Code e data/hora) e grava o JPEG final. O SHA-256 é o
 * dos bytes gravados (o mesmo que a fila de envio vai confirmar).
 * Se a marca de água não puder ser desenhada, falha: nunca se envia uma foto sem ela.
 */
export async function fotoComMarcaDeAgua(uriCamara: string, linhas: [string, string]): Promise<FotoComMarca> {
  const reduzida = await manipulateAsync(uriCamara, [{ resize: { width: LARGURA_FOTO } }], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  const imagem = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(reduzida.uri));
  if (!imagem) throw new Error('Não foi possível abrir a foto.');
  const largura = imagem.width();
  const altura = imagem.height();
  const superficie = Skia.Surface.MakeOffscreen(largura, altura) ?? Skia.Surface.Make(largura, altura);
  if (!superficie) throw new Error('Não foi possível preparar a marca de água.');

  const d = desenhoMarca(largura, altura);
  const tela = superficie.getCanvas();
  tela.drawImage(imagem, 0, 0);
  const fundo = Skia.Paint();
  fundo.setColor(Skia.Color('rgba(0,0,0,0.6)'));
  tela.drawRect(Skia.XYWHRect(0, altura - d.alturaFaixa, largura, d.alturaFaixa), fundo);
  const letra = Skia.Paint();
  letra.setColor(Skia.Color('white'));
  const fonte = matchFont({ fontFamily: 'sans-serif', fontSize: d.tamanhoLetra, fontWeight: 'bold' });
  tela.drawText(linhas[0], d.margem, d.yLinhas[0], letra, fonte);
  tela.drawText(linhas[1], d.margem, d.yLinhas[1], letra, fonte);
  superficie.flush();

  const bytes = superficie.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, QUALIDADE_JPEG);
  if (!bytes || bytes.length < 2000) throw new Error('A foto ficou vazia. Tenta outra vez.');

  const pasta = new Directory(Paths.document, 'fotos');
  pasta.create({ intermediates: true, idempotent: true });
  const ficheiro = new File(pasta, `fachada-${gerarUuid()}.jpg`);
  ficheiro.create();
  ficheiro.write(bytes);
  // A foto reduzida intermédia (na cache) já não é precisa.
  try {
    new File(reduzida.uri).delete();
  } catch {
    // Fica para o sistema limpar.
  }
  return { uri: ficheiro.uri, sha256: sha256Hex(bytes), tamanhoBytes: bytes.length };
}
