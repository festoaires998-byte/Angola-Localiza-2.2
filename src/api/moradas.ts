import type { CategoriaFavorito } from '@/database/repositories/favoritos';

import { lerFavoritosDoServidor, SELECAO_FAVORITOS, type FavoritoDoServidor } from './moradasNucleo';
import { supabase } from './supabase';

export type { DadosMorada, FavoritoDoServidor } from './moradasNucleo';

function erro(e: { message?: string } | null, texto: string): Error {
  return new Error(e?.message ? `${texto} (${e.message})` : texto);
}

/** Os favoritos do utilizador com sessão (a política do servidor só devolve os dele). */
export async function lerFavoritos(): Promise<FavoritoDoServidor[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(SELECAO_FAVORITOS)
    .order('created_at', { ascending: false });
  if (error) throw erro(error, 'Não foi possível ler as moradas guardadas.');
  return lerFavoritosDoServidor(data, new Date().toISOString());
}

export async function atualizarFavorito(
  id: string,
  mudancas: { nome: string; categoria: CategoriaFavorito },
): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .update({ label: mudancas.nome.trim() || null, category: mudancas.categoria })
    .eq('id', id);
  if (error) throw erro(error, 'Não foi possível guardar a alteração.');
}

/** Tira dos favoritos (a morada continua a existir). Se já não existir, não é erro. */
export async function removerFavorito(id: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('id', id);
  if (error) throw erro(error, 'Não foi possível tirar a morada dos favoritos.');
}
