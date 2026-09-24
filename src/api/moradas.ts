import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import type { NovoFavoritoComMorada } from '@/services/moradas/moradas';

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

/**
 * "Guardar como favorito" (Mapa): cria a morada por validar (PROPOSED) e o
 * favorito, com os ids gerados no telemóvel. As regras do servidor só deixam
 * criar moradas por validar e em nome de quem pede. Se a morada ou o favorito
 * já existirem (a resposta perdeu-se e a app tentou outra vez), não é erro.
 */
export async function criarFavoritoComMorada(userId: string, novo: NovoFavoritoComMorada): Promise<void> {
  const m = novo.morada;
  const { error: erroMorada } = await supabase.from('addresses').insert({
    id: m.id,
    latitude: m.latitude,
    longitude: m.longitude,
    location: `SRID=4326;POINT(${m.longitude} ${m.latitude})`,
    accuracy_meters: m.precisao,
    plus_code: m.plusCode,
    postal_code: m.codigoPostal,
    visibility_level: m.visibilidade,
    status: 'PROPOSED',
    source: 'app',
    created_by: userId,
  });
  // 23505 = já existe (envio repetido).
  if (erroMorada && erroMorada.code !== '23505') throw erro(erroMorada, 'Não foi possível guardar a morada.');
  const { error: erroFavorito } = await supabase.from('favorites').upsert(
    {
      id: novo.favorito.id,
      user_id: userId,
      address_id: m.id,
      category: novo.favorito.categoria,
      label: novo.favorito.nome.trim() || null,
    },
    { onConflict: 'user_id,address_id', ignoreDuplicates: true },
  );
  if (erroFavorito) throw erro(erroFavorito, 'Não foi possível guardar o favorito.');
}
