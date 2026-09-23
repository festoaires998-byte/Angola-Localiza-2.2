import { abrirSessaoDoLink, consumirAdesaoPendente } from '@/api/auth';
import { criarLoja } from '@/state/loja';

import { lerLinkAuth } from './linksProfundos';

/** O que aconteceu ao último link do email (recuperação ou confirmação). */
export type EstadoLinkAuth =
  | { estado: 'nenhum' }
  | { estado: 'a_abrir' }
  | { estado: 'aberto'; motivo: string | null }
  | { estado: 'erro'; mensagem: string };

export const estadoLinkAuth = criarLoja<EstadoLinkAuth>({ estado: 'nenhum' });

const tratados = new Set<string>();

/**
 * Trata um link que abriu a app. Os links do email trazem a sessão no URL:
 * abre-a aqui (o ecrã certo é aberto pelo expo-router a partir do caminho).
 * O link de adesão é tratado pelo próprio ecrã /adesao.
 * Cada URL só é tratado uma vez.
 */
export async function tratarLink(url: string | null): Promise<void> {
  if (!url || tratados.has(url)) return;
  const link = lerLinkAuth(url);
  if (!link) return;
  tratados.add(url);
  estadoLinkAuth.definir({ estado: 'a_abrir' });
  try {
    await abrirSessaoDoLink(link);
    estadoLinkAuth.definir({ estado: 'aberto', motivo: link.tipo === 'tokens' ? link.motivo : null });
    // Um convite guardado antes de confirmar o email é aceite agora.
    await consumirAdesaoPendente().catch(() => undefined);
  } catch (e) {
    estadoLinkAuth.definir({
      estado: 'erro',
      mensagem: e instanceof Error ? e.message : 'Este link não pôde ser aberto. Pede um novo.',
    });
  }
}
