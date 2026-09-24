import type { CategoriaFavorito } from '@/database/repositories/favoritos';
import { lerRegistos, type Registo } from '@/domain/enderecamento/meusRegistos';

import { supabase } from './supabase';

/**
 * "Os meus registos": as moradas que a pessoa registou (field_records) e,
 * para as aprovadas, o código postal e o número da morada criada.
 * As regras do servidor só deixam ler os registos e as moradas da própria pessoa.
 */
export async function lerMeusRegistos(userId: string): Promise<Registo[]> {
  const { data, error } = await supabase
    .from('field_records')
    .select('id,status,reference,neighborhood_name,collected_at,validated_at,resulting_address_id')
    .eq('collected_by', userId)
    .order('collected_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Não foi possível ler os teus registos (${error.message}).`);
  const ids = (data ?? [])
    .map((l: { resulting_address_id?: unknown }) => l.resulting_address_id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  const moradas = new Map<string, { codigoPostal: string | null; numeroPorta: string | null }>();
  if (ids.length > 0) {
    const r = await supabase.from('addresses').select('id,postal_code,house_number').in('id', ids);
    if (r.error) throw new Error(`Não foi possível ler as moradas aprovadas (${r.error.message}).`);
    for (const a of (r.data ?? []) as { id: string; postal_code: string | null; house_number: string | null }[]) {
      moradas.set(a.id, { codigoPostal: a.postal_code, numeroPorta: a.house_number });
    }
  }
  return lerRegistos(data ?? [], moradas);
}

/** Põe a morada nos favoritos da pessoa (se já lá estiver, não faz nada). */
export async function juntarAosFavoritos(
  userId: string,
  moradaId: string,
  categoria: CategoriaFavorito,
  nome: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .upsert(
      { user_id: userId, address_id: moradaId, category: categoria, label: nome },
      { onConflict: 'user_id,address_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(`Não foi possível guardar a morada aprovada (${error.message}).`);
}
