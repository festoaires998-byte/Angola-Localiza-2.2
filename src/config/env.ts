/**
 * Variáveis de ambiente da app.
 *
 * O Expo só mete no código as variáveis EXPO_PUBLIC_* quando são lidas assim,
 * por extenso (process.env.EXPO_PUBLIC_...). Não trocar por process.env[nome].
 */

export interface ConfigSupabase {
  url: string;
  chaveAnon: string;
}

/** Valores falsos usados nos testes (nunca chegam a um servidor). */
export const CONFIG_SUPABASE_TESTE: ConfigSupabase = {
  url: 'https://teste.supabase.co',
  chaveAnon: 'chave-anon-de-teste',
};

function emTeste(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
}

/**
 * Confirma que as duas variáveis existem e que o URL é válido.
 * Separada de obterConfigSupabase() para poder ser testada.
 */
export function validarConfigSupabase(
  url: string | undefined,
  chaveAnon: string | undefined,
): ConfigSupabase {
  const faltam: string[] = [];
  if (!url?.trim()) faltam.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!chaveAnon?.trim()) faltam.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (faltam.length > 0) {
    throw new Error(
      `Falta configurar ${faltam.join(' e ')}. ` +
        'Copia o ficheiro .env.example para .env, preenche os valores do projeto Supabase ' +
        'e volta a arrancar a app (npx expo start --clear).',
    );
  }
  const limpo = url!.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(limpo)) {
    throw new Error(
      `EXPO_PUBLIC_SUPABASE_URL não parece um endereço válido: "${limpo}". ` +
        'Deve ser algo como https://xxxx.supabase.co',
    );
  }
  return { url: limpo, chaveAnon: chaveAnon!.trim() };
}

let config: ConfigSupabase | null = null;

/** URL e chave pública (anon) do Supabase. Nos testes devolve valores falsos. */
export function obterConfigSupabase(): ConfigSupabase {
  if (!config) {
    config = emTeste()
      ? CONFIG_SUPABASE_TESTE
      : validarConfigSupabase(
          process.env.EXPO_PUBLIC_SUPABASE_URL,
          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        );
  }
  return config;
}
