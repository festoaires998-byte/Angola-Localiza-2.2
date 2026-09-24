import { lerFotosKyc, lerPedidosKyc, type FotosKyc, type PedidoKyc } from '@/domain/identidade/revisaoKyc';
import { paraBase64 } from '@/services/crypto/base64';

import { chamarFuncao } from './edge/chamarFuncao';

/** citizen-verify?action=list_pending: verificações por rever (quem é e quando enviou; sem fotos). */
export async function listarPedidosKyc(): Promise<PedidoKyc[]> {
  return lerPedidosKyc(await chamarFuncao<unknown>('citizen-verify', 'list_pending', { tempoMaximo: 30_000 }));
}

/**
 * citizen-verify?action=view: links de 10 minutos para as 3 fotos de um pedido.
 * O servidor regista quem abriu e quando (Lei n.º 22/11).
 */
export async function abrirFotosKyc(userId: string): Promise<FotosKyc> {
  return lerFotosKyc(await chamarFuncao<unknown>('citizen-verify', 'view', { body: { user_id: userId }, tempoMaximo: 20_000 }));
}

/** citizen-verify?action=review: aprova, ou recusa com motivo (o cidadão vê o motivo e recebe um aviso). */
export async function decidirPedidoKyc(userId: string, decisao: { aprovar: true } | { aprovar: false; motivo: string }): Promise<void> {
  const r = await chamarFuncao<{ ok?: unknown; error?: unknown }>('citizen-verify', 'review', {
    body: decisao.aprovar
      ? { user_id: userId, decision: 'approve' }
      : { user_id: userId, decision: 'reject', reason: decisao.motivo.trim() },
    tempoMaximo: 20_000,
  });
  if (r?.error) throw new Error(String(r.error));
  if (r?.ok !== true) throw new Error('O servidor não confirmou a decisão.');
}

/** Tamanho máximo de uma foto da verificação (as da app têm ~150–300 KB). */
const MAX_BYTES_FOTO = 8 * 1024 * 1024;

/**
 * Descarrega uma foto privada pelo link temporário e devolve-a como "data:"
 * para mostrar. Fica só na memória do ecrã: não vai para a cache de imagens
 * nem para ficheiros do telemóvel.
 */
export async function lerFotoKyc(url: string): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new Error('Sem ligação ao servidor.');
  }
  if (!resposta.ok) throw new Error(resposta.status === 400 || resposta.status === 403 ? 'O link da foto expirou.' : `Erro ${resposta.status}.`);
  const tipo = resposta.headers.get('content-type') ?? 'image/jpeg';
  if (!tipo.startsWith('image/')) throw new Error('O ficheiro não é uma imagem.');
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (bytes.length > MAX_BYTES_FOTO) throw new Error('A foto é grande demais.');
  return `data:${tipo.split(';')[0]};base64,${paraBase64(bytes)}`;
}
