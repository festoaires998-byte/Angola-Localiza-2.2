import { describe, expect, test } from '@jest/globals';

import { CONFIG_SUPABASE_TESTE, obterConfigSupabase, validarConfigSupabase } from './env';

describe('env', () => {
  test('nos testes usa valores falsos', () => {
    expect(obterConfigSupabase()).toEqual(CONFIG_SUPABASE_TESTE);
  });

  test.each<[string | undefined, string | undefined, RegExp]>([
    [undefined, 'chave', /Falta configurar EXPO_PUBLIC_SUPABASE_URL\./],
    ['https://x.supabase.co', '', /Falta configurar EXPO_PUBLIC_SUPABASE_ANON_KEY\./],
    ['', '  ', /EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY/],
    ['x.supabase.co', 'chave', /não parece um endereço válido/],
  ])('url=%j chave=%j dá erro claro', (url, chave, erro) => {
    expect(() => validarConfigSupabase(url, chave)).toThrow(erro);
  });

  test('limpa espaços e a barra final', () => {
    expect(validarConfigSupabase(' https://x.supabase.co/ ', ' k ')).toEqual({
      url: 'https://x.supabase.co',
      chaveAnon: 'k',
    });
  });
});
