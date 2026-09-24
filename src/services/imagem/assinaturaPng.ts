import { ImageFormat, PaintStyle, Skia, StrokeCap, StrokeJoin } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';

import { gerarUuid } from '@/database/ids';
import { caminhoSvg, type Traco } from '@/domain/entregas/assinaturaDedo';

import type { FotoComMarca } from './fotoComMarca';
import { sha256Hex } from './hashFoto';

/** O PNG sai com o dobro dos pontos do ecrã (fica nítido). */
const ESCALA = 2;

/**
 * Grava a assinatura desenhada com o dedo num PNG (traço preto sobre branco)
 * na pasta de documentos. O SHA-256 é o dos bytes gravados: é esse que vai na
 * mensagem assinada pelo aparelho (assinatura_manuscrita_sha256).
 */
export function gravarAssinaturaPng(tracos: readonly Traco[], largura: number, altura: number): FotoComMarca {
  const w = Math.max(1, Math.round(largura * ESCALA));
  const h = Math.max(1, Math.round(altura * ESCALA));
  const superficie = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!superficie) throw new Error('Não foi possível gravar a assinatura.');
  const tela = superficie.getCanvas();
  tela.clear(Skia.Color('white'));

  const escalados = tracos.map((t) => t.map((p) => ({ x: p.x * ESCALA, y: p.y * ESCALA })));
  const caminho = Skia.Path.MakeFromSVGString(caminhoSvg(escalados));
  if (!caminho) throw new Error('A assinatura está vazia.');
  const tinta = Skia.Paint();
  tinta.setColor(Skia.Color('black'));
  tinta.setStyle(PaintStyle.Stroke);
  tinta.setStrokeWidth(3 * ESCALA);
  tinta.setStrokeCap(StrokeCap.Round);
  tinta.setStrokeJoin(StrokeJoin.Round);
  tinta.setAntiAlias(true);
  tela.drawPath(caminho, tinta);
  superficie.flush();

  const bytes = superficie.makeImageSnapshot().encodeToBytes(ImageFormat.PNG);
  if (!bytes || bytes.length < 100) throw new Error('A assinatura ficou vazia. Tenta outra vez.');

  const pasta = new Directory(Paths.document, 'fotos');
  pasta.create({ intermediates: true, idempotent: true });
  const ficheiro = new File(pasta, `assinatura-${gerarUuid()}.png`);
  ficheiro.create();
  ficheiro.write(bytes);
  return { uri: ficheiro.uri, sha256: sha256Hex(bytes), tamanhoBytes: bytes.length };
}
