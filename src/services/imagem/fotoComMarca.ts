import { FontSlant, FontWeight, ImageFormat, matchFont, Skia, type SkCanvas, type SkFont, type SkImage, type SkPaint } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { gerarUuid } from '@/database/ids';

import { sha256Hex } from './hashFoto';
import { desenhoMarca, ladoALado, LARGURA_FOTO, QUALIDADE_JPEG, separarEmoji } from './marcaDeAgua';

export interface FotoComMarca {
  /** Ficheiro final na pasta de documentos (o sistema não o apaga, ao contrário da cache). */
  uri: string;
  sha256: string;
  tamanhoBytes: number;
}

/** Reduz a foto da câmara e abre-a no Skia. */
async function abrir(uriCamara: string, redimensionar: { width: number } | { height: number }): Promise<SkImage> {
  const reduzida = await manipulateAsync(uriCamara, [{ resize: redimensionar }], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  const imagem = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(reduzida.uri));
  // A foto reduzida intermédia (na cache) já não é precisa.
  try {
    new File(reduzida.uri).delete();
  } catch {
    // Fica para o sistema limpar.
  }
  if (!imagem) throw new Error('Não foi possível abrir a foto.');
  return imagem;
}

/** Fonte de emojis do Android (a fonte normal não tem o "📍"). null se não houver. */
function fonteEmoji(tamanho: number): SkFont | null {
  try {
    const tipo = Skia.FontMgr.System().matchFamilyStyle('Noto Color Emoji', { weight: FontWeight.Normal, slant: FontSlant.Upright });
    return tipo ? Skia.Font(tipo, tamanho) : null;
  } catch {
    return null;
  }
}

/**
 * Uma linha da marca de água. Se começar por um emoji (ex.: "📍"), o emoji
 * é desenhado com a fonte de emojis e o resto com a fonte normal; sem fonte
 * de emojis, fica só o texto (nunca um quadrado vazio).
 */
function desenharLinha(tela: SkCanvas, linha: string, x: number, y: number, letra: SkPaint, fonte: SkFont, tamanho: number): void {
  const { emoji, resto } = separarEmoji(linha);
  if (!emoji) {
    tela.drawText(linha, x, y, letra, fonte);
    return;
  }
  const fEmoji = fonteEmoji(tamanho);
  if (!fEmoji) {
    tela.drawText(resto, x, y, letra, fonte);
    return;
  }
  tela.drawText(emoji, x, y, letra, fEmoji);
  const largura = fEmoji.measureText(emoji).width;
  tela.drawText(` ${resto}`, x + largura, y, letra, fonte);
}

/**
 * Desenha as fotos lado a lado (com a mesma altura), a faixa da marca de água
 * por cima e grava o JPEG final. O SHA-256 é o dos bytes gravados.
 * Se a marca de água não puder ser desenhada, falha: nunca há foto sem ela.
 */
function desenharEGravar(imagens: SkImage[], linhas: [string, string], prefixo: string): FotoComMarca {
  const altura = Math.min(...imagens.map((i) => i.height()));
  const lay = ladoALado(
    imagens.map((i) => ({ largura: i.width(), altura: i.height() })),
    altura,
  );
  const superficie = Skia.Surface.MakeOffscreen(lay.largura, lay.altura) ?? Skia.Surface.Make(lay.largura, lay.altura);
  if (!superficie) throw new Error('Não foi possível preparar a marca de água.');

  const tela = superficie.getCanvas();
  const pintura = Skia.Paint();
  imagens.forEach((img, i) => {
    const { x, largura } = lay.posicoes[i];
    tela.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(x, 0, largura, lay.altura), pintura);
  });
  const d = desenhoMarca(lay.largura, lay.altura);
  const fundo = Skia.Paint();
  fundo.setColor(Skia.Color('rgba(0,0,0,0.6)'));
  tela.drawRect(Skia.XYWHRect(0, lay.altura - d.alturaFaixa, lay.largura, d.alturaFaixa), fundo);
  const letra = Skia.Paint();
  letra.setColor(Skia.Color('white'));
  const fonte = matchFont({ fontFamily: 'sans-serif', fontSize: d.tamanhoLetra, fontWeight: 'bold' });
  desenharLinha(tela, linhas[0], d.margem, d.yLinhas[0], letra, fonte, d.tamanhoLetra);
  desenharLinha(tela, linhas[1], d.margem, d.yLinhas[1], letra, fonte, d.tamanhoLetra);
  superficie.flush();

  const bytes = superficie.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, QUALIDADE_JPEG);
  if (!bytes || bytes.length < 2000) throw new Error('A foto ficou vazia. Tenta outra vez.');

  const pasta = new Directory(Paths.document, 'fotos');
  pasta.create({ intermediates: true, idempotent: true });
  const ficheiro = new File(pasta, `${prefixo}-${gerarUuid()}.jpg`);
  ficheiro.create();
  ficheiro.write(bytes);
  return { uri: ficheiro.uri, sha256: sha256Hex(bytes), tamanhoBytes: bytes.length };
}

/** Uma foto (ex.: a fachada), reduzida para 1280 px de largura, com a marca de água. */
export async function fotoComMarcaDeAgua(uriCamara: string, linhas: [string, string], prefixo = 'fachada'): Promise<FotoComMarca> {
  return desenharEGravar([await abrir(uriCamara, { width: LARGURA_FOTO })], linhas, prefixo);
}

/** Duas fotos lado a lado (ex.: as duas selfies da verificação), com uma marca de água por baixo das duas. */
export async function fotosLadoALadoComMarca(uriA: string, uriB: string, linhas: [string, string], prefixo = 'selfies'): Promise<FotoComMarca> {
  // Cada uma com 960 px de altura: a imagem final fica com ~1440 × 960 (retrato).
  const [a, b] = await Promise.all([abrir(uriA, { height: 960 }), abrir(uriB, { height: 960 })]);
  return desenharEGravar([a, b], linhas, prefixo);
}
