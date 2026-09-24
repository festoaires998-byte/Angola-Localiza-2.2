import { chamarFuncao } from './edge/chamarFuncao';
import { lerDuplicado, lerRuasDaQuadra, type Duplicado, type RuasDaQuadra } from './registoNucleo';
import { supabase } from './supabase';

export type { Duplicado, Rua, RuasDaQuadra } from './registoNucleo';

/** Ruas já conhecidas na quadra onde o ponto cai. */
export async function pedirRuasDaQuadra(latitude: number, longitude: number): Promise<RuasDaQuadra> {
  const r = await chamarFuncao<unknown>('field-service', 'list_streets_in_quadra', {
    body: { latitude, longitude },
    tempoMaximo: 15_000,
  });
  return lerRuasDaQuadra(r);
}

/** Há alguma morada a menos de 15 m? */
export async function procurarDuplicado(latitude: number, longitude: number): Promise<Duplicado | null> {
  const r = await chamarFuncao<unknown>('field-service', 'check_duplicates', {
    body: { latitude, longitude },
    tempoMaximo: 15_000,
  });
  return lerDuplicado(r);
}

/**
 * O cidadão já fez a "verificação simples" da identidade? (o servidor só
 * aceita registos de moradas de quem a fez). A política do servidor só deixa
 * ler a própria linha.
 */
export async function lerVerificacaoCidadao(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_identity')
    .select('citizen_id_verified')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ver a verificação da identidade (${error.message}).`);
  return (data as { citizen_id_verified?: unknown } | null)?.citizen_id_verified === true;
}
