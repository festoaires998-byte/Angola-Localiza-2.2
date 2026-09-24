import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * "Guardar" o QR Code: grava a imagem (PNG) na pasta temporária e abre a
 * janela de partilha do telemóvel, onde se escolhe "Guardar na galeria",
 * "Ficheiros", WhatsApp… (não é preciso pedir acesso às fotos).
 */
export async function partilharQrPng(base64: string, nome: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este telemóvel não deixa guardar nem partilhar a imagem.');
  const pasta = new Directory(Paths.cache, 'qr');
  pasta.create({ intermediates: true, idempotent: true });
  const ficheiro = new File(pasta, nome);
  if (ficheiro.exists) ficheiro.delete();
  ficheiro.create();
  ficheiro.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(ficheiro.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Guardar o QR Code' });
}
