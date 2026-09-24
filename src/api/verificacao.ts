import { estadoDoServidor, type EstadoCidadao } from '@/domain/identidade/verificacaoSimples';

import { chamarFuncao } from './edge/chamarFuncao';
import { supabase } from './supabase';
import { lerEstadoVerificacao, type EstadoVerificacaoServidor } from './verificacaoNucleo';

export { lerEstadoVerificacao, type EstadoVerificacaoServidor } from './verificacaoNucleo';

/** Bucket PRIVADO das fotos de identidade (ninguém o lê pela app; só a equipa de verificação). */
export const BUCKET_IDENTIDADE = 'kyc-artifacts';

/** Envia uma foto da verificação. Se já lá estiver (reenvio depois de uma falha), não é erro. */
export async function enviarFotoIdentidade(nome: string, bytes: Uint8Array): Promise<void> {
  const copia = bytes.slice().buffer as ArrayBuffer;
  const { error } = await supabase.storage.from(BUCKET_IDENTIDADE).upload(nome, copia, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Não foi possível enviar a foto (${error.message}).`);
  }
}

/** citizen-verify?action=submit: o servidor confirma as 3 fotos e põe a verificação "em revisão". */
export async function submeterVerificacao(pedido: {
  id_photo_front_url: string;
  id_photo_back_url: string;
  selfie_url: string;
}): Promise<EstadoCidadao> {
  const r = await chamarFuncao<{ ok?: unknown; error?: unknown; status?: unknown }>('citizen-verify', 'submit', {
    body: pedido,
    tempoMaximo: 20_000,
  });
  if (r?.error) throw new Error(String(r.error));
  if (r?.ok !== true) throw new Error('O servidor não confirmou o pedido de verificação.');
  // Versões antigas da função (sem "status") aprovavam logo.
  return r.status === undefined ? 'verificado' : estadoDoServidor(false, r.status);
}

/** citizen-verify?action=status: estado atual da verificação de quem tem sessão. */
export async function pedirEstadoVerificacao(): Promise<EstadoVerificacaoServidor> {
  return lerEstadoVerificacao(await chamarFuncao<unknown>('citizen-verify', 'status', { tempoMaximo: 15_000 }));
}
