/**
 * @jest-environment node
 */
// As funções antigas "search" e "resolve-address" ficam desativadas: respondem
// 410 com a explicação e nunca leem a base de dados.
import { describe, expect, jest, test } from '@jest/globals';

import { carregarFuncao, criarSupabaseFalso, URL_SUPABASE_FALSO } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });

describe.each(['search', 'resolve-address'])('função %s (desativada)', (nome) => {
  const handler = carregarFuncao(() => {
    jest.isolateModules(() => {
      require(`../../supabase/functions/${nome}/index.ts`);
    });
  });

  test('responde 410 e indica a "pesquisa", sem ler a base de dados', async () => {
    const falso = criarSupabaseFalso({ tabelas: { addresses: [{ id: 'm1', postal_code: 'AO-HUA-MNFQR6JW-41', status: 'PROPOSED' }] } });
    (globalThis as any).__supabaseFalso = falso;
    const res = await handler(
      new Request(`${URL_SUPABASE_FALSO}/functions/v1/${nome}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'AO-HUA-MNFQR6JW-41' }),
      }),
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'funcao desativada: use a funcao pesquisa', substituida_por: 'pesquisa' });
    expect(falso.rpcsChamadas).toEqual([]);
  });

  test('o pedido OPTIONS (CORS) do site continua a responder', async () => {
    const res = await handler(new Request(`${URL_SUPABASE_FALSO}/functions/v1/${nome}`, { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
  });
});
