/**
 * @jest-environment node
 */
// A Edge Function "pesquisa" a correr de verdade (index.ts), com um Supabase
// falso em memória, e as regras puras (regras.ts).
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  MAX_RESULTADOS,
  cartaoPublico,
  interpretar,
  interpretarCodigo,
  juntarResultados,
  padraoContem,
  podeVer,
  podeVerPublico,
  resultadoLugar,
} from '../../supabase/functions/pesquisa/regras';
import { carregarFuncao, criarSupabaseFalso, ilikeParaRegex, pedir, URL_SUPABASE_FALSO, type SupabaseFalso } from '@/testes/supabaseFalso';

jest.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}), { virtual: true });
jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({ createClient: () => (globalThis as any).__supabaseFalso.cliente }),
  { virtual: true },
);

const handler = carregarFuncao(() => {
  jest.isolateModules(() => {
    require('../../supabase/functions/pesquisa/index.ts');
  });
});

const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const RUI = 'aaaaaaaa-0000-4000-8000-000000000002';
const RUA_MISSAO = 'dddddddd-0000-4000-8000-000000000001';
const RUA_SEM_MORADAS = 'dddddddd-0000-4000-8000-000000000002';
const BAIRRO = 'eeeeeeee-0000-4000-8000-000000000001';

function morada(id: string, extra: Record<string, unknown>) {
  return {
    id,
    postal_code: null,
    plus_code: null,
    house_number: null,
    reference: null,
    status: 'APPROVED',
    visibility_level: 'PUBLIC',
    created_by: RUI,
    latitude: -12.77,
    longitude: 15.73,
    street_id: null,
    neighborhood_id: null,
    phone: '923000000',
    ...extra,
  };
}

const MORADAS = [
  morada('m1', { postal_code: 'AO-HUA-MNFQR6JW-41', plus_code: '6GXCQ6FM+2V', street_id: RUA_MISSAO, house_number: '12', reference: 'Portão azul', neighborhood_id: BAIRRO, quadra_id: 'q1' }),
  morada('m2', { postal_code: 'AO-HUA-MNFQR6JX-17', status: 'PROPOSED', reference: 'Portão verde' }),
  morada('m3', { postal_code: 'AO-HUA-MNFQR6JY-22', visibility_level: 'PRIVATE', reference: 'Casa privada' }),
  morada('m4', { postal_code: 'AO-HUA-MNFQR6JZ-35', visibility_level: 'PRIVATE', created_by: ANA, reference: 'Casa privada da Ana' }),
  morada('m5', { postal_code: 'AO-HUA-MNFQR6KA-50', status: 'PUBLISHED', reference: '100% Loja_do bairro' }),
];

let falso: SupabaseFalso;

/** Como a função SQL sem_acentos (unaccent) + ilike. */
const semAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const bate = (valor: unknown, padrao: string) =>
  typeof valor === 'string' && new RegExp(`^${ilikeParaRegex(semAcentos(padrao))}$`, 'is').test(semAcentos(valor));

/** As funções SQL da migração 20260924080000_pesquisa_sem_acentos. */
const RPC = {
  pesquisa_ruas: (a: { p_padrao: string; p_limite: number }, t: Record<string, any[]>) =>
    (t.streets ?? []).filter((r) => bate(r.name, a.p_padrao)).slice(0, a.p_limite),
  pesquisa_bairros: (a: { p_padrao: string; p_limite: number }, t: Record<string, any[]>) =>
    (t.neighborhoods ?? []).filter((r) => bate(r.name, a.p_padrao)).slice(0, a.p_limite),
  pesquisa_moradas_por_referencia: (a: { p_padrao: string; p_estados: string[]; p_limite: number }, t: Record<string, any[]>) =>
    (t.addresses ?? []).filter((m) => a.p_estados.includes(m.status) && bate(m.reference, a.p_padrao)).slice(0, a.p_limite),
};

function preparar() {
  falso = criarSupabaseFalso({
    sessoes: { 'token-a': ANA },
    tabelas: {
      addresses: MORADAS,
      streets: [
        { id: RUA_MISSAO, name: 'Rua da Missão', neighborhood_id: BAIRRO, origin_lat: null, origin_lng: null },
        { id: RUA_SEM_MORADAS, name: 'Rua da Missão Nova', neighborhood_id: null, origin_lat: -12.8, origin_lng: 15.8 },
      ],
      neighborhoods: [{ id: BAIRRO, name: 'Bairro Académico' }],
      quadras: [{ id: 'q1', code: 'Q-12' }],
    },
    rpc: RPC,
  });
  (globalThis as any).__supabaseFalso = falso;
}

beforeEach(preparar);

const pesquisar = (query: unknown, token: string | null = 'token-a') => pedir(handler, null, { query }, token);

describe('regras da pesquisa', () => {
  test('reconhece código postal, Plus Code, "Rua, número" e texto', () => {
    expect(interpretar(' ao-hua-mnfqr6jw-41 ')).toEqual({ tipo: 'codigo_postal', valor: 'AO-HUA-MNFQR6JW-41' });
    expect(interpretar('AO-HUA-MNFQR6JW-41-2')).toEqual({ tipo: 'codigo_postal', valor: 'AO-HUA-MNFQR6JW-41-2' });
    expect(interpretar('6gxcq6fm+2v')).toEqual({ tipo: 'plus_code', valor: '6GXCQ6FM+2V' });
    expect(interpretar('Q6FM+2V')).toEqual({ tipo: 'plus_code', valor: 'Q6FM+2V' });
    expect(interpretar('Rua da Missão, 12')).toEqual({ tipo: 'rua_numero', rua: 'Rua da Missão', numero: '12' });
    expect(interpretar('Rua da  Missão')).toEqual({ tipo: 'texto', valor: 'Rua da Missão' });
    expect(interpretar('Huambo, Angola')).toEqual({ tipo: 'texto', valor: 'Huambo, Angola' });
  });

  test('recusa pesquisas vazias, curtas, longas ou que não são texto', () => {
    expect(interpretar('')).toBeNull();
    expect(interpretar('ab')).toBeNull();
    expect(interpretar('x'.repeat(81))).toBeNull();
    expect(interpretar(42)).toBeNull();
    expect(interpretar(null)).toBeNull();
  });

  test('o que a pessoa escreve nunca vira curinga do ilike', () => {
    expect(padraoContem('100%')).toBe('%100\\%%');
    expect(padraoContem('a_b\\c')).toBe('%a\\_b\\\\c%');
  });

  test('só se veem moradas aprovadas, e as privadas só por quem as criou', () => {
    expect(podeVer({ status: 'APPROVED', visibility_level: 'PUBLIC', created_by: RUI }, ANA)).toBe(true);
    expect(podeVer({ status: 'OFFICIAL', visibility_level: 'LIMITED', created_by: RUI }, ANA)).toBe(true);
    expect(podeVer({ status: 'PROPOSED', visibility_level: 'PUBLIC', created_by: ANA }, ANA)).toBe(false);
    expect(podeVer({ status: 'APPROVED', visibility_level: 'PRIVATE', created_by: RUI }, ANA)).toBe(false);
    expect(podeVer({ status: 'APPROVED', visibility_level: 'PRIVATE', created_by: ANA }, ANA)).toBe(true);
  });

  test('junta sem repetidos e corta no máximo', () => {
    const r = (i: number) => resultadoLugar('rua', `r${i}`, `Rua ${i}`, null, null);
    const lista = juntarResultados([[r(1), r(2)], [r(2), ...Array.from({ length: 20 }, (_, i) => r(i + 3))]]);
    expect(lista).toHaveLength(MAX_RESULTADOS);
    expect(lista.filter((x) => x.id === 'r2')).toHaveLength(1);
  });
});

describe('Edge Function pesquisa', () => {
  test('sem sessão: 401', async () => {
    expect((await pesquisar('Rua da Missão', null)).status).toBe(401);
    expect((await pesquisar('Rua da Missão', 'token-falso')).status).toBe(401);
  });

  test('pesquisa inválida: 400', async () => {
    const r = await pesquisar('ab');
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/3 e 80/);
  });

  test('por código postal: devolve a morada com a rua e o número, sem contacto nem quem criou', async () => {
    const r = await pesquisar('ao-hua-mnfqr6jw-41');
    expect(r.status).toBe(200);
    expect(r.json.tipo).toBe('codigo_postal');
    expect(r.json.resultados).toEqual([
      {
        tipo: 'morada',
        id: 'm1',
        titulo: 'AO-HUA-MNFQR6JW-41',
        subtitulo: 'Rua da Missão, nº 12 · Portão azul',
        latitude: -12.77,
        longitude: 15.73,
        codigo_postal: 'AO-HUA-MNFQR6JW-41',
        plus_code: '6GXCQ6FM+2V',
      },
    ]);
    expect(JSON.stringify(r.json)).not.toMatch(/923000000|created_by|phone/);
  });

  test('não encontra moradas por validar nem privadas de outra pessoa', async () => {
    expect((await pesquisar('AO-HUA-MNFQR6JX-17')).json.resultados).toEqual([]);
    expect((await pesquisar('AO-HUA-MNFQR6JY-22')).json.resultados).toEqual([]);
  });

  test('encontra a própria morada privada', async () => {
    const r = await pesquisar('AO-HUA-MNFQR6JZ-35');
    expect(r.json.resultados.map((x: { id: string }) => x.id)).toEqual(['m4']);
  });

  test('por Plus Code (completo ou curto)', async () => {
    expect((await pesquisar('6GXCQ6FM+2V')).json.resultados.map((x: { id: string }) => x.id)).toEqual(['m1']);
    expect((await pesquisar('q6fm+2v')).json.resultados.map((x: { id: string }) => x.id)).toEqual(['m1']);
  });

  test('por "Rua, número"', async () => {
    const r = await pesquisar('rua da missão, 12');
    expect(r.json.tipo).toBe('rua_numero');
    expect(r.json.resultados.map((x: { id: string }) => x.id)).toEqual(['m1']);
    expect((await pesquisar('Rua da Missão, 99')).json.resultados).toEqual([]);
    expect((await pesquisar('Rua Inexistente, 12')).json.resultados).toEqual([]);
  });

  test('por texto: ruas (com o bairro e a posição), bairros e referências', async () => {
    const r = await pesquisar('missão');
    expect(r.json.tipo).toBe('texto');
    expect(r.json.resultados).toEqual([
      expect.objectContaining({ tipo: 'rua', id: RUA_MISSAO, titulo: 'Rua da Missão', subtitulo: 'Rua · Bairro Académico', latitude: -12.77, longitude: 15.73 }),
      expect.objectContaining({ tipo: 'rua', id: RUA_SEM_MORADAS, subtitulo: 'Rua', latitude: -12.8, longitude: 15.8 }),
    ]);

    const bairro = await pesquisar('académico');
    expect(bairro.json.resultados).toEqual([
      expect.objectContaining({ tipo: 'bairro', id: BAIRRO, titulo: 'Bairro Académico', latitude: -12.77 }),
    ]);

    const portao = await pesquisar('portão');
    // "Portão verde" está por validar: não aparece.
    expect(portao.json.resultados.map((x: { id: string }) => x.id)).toEqual(['m1']);
  });

  test('por texto não mostra privadas de outra pessoa, mas mostra as próprias', async () => {
    const r = await pesquisar('casa privada');
    expect(r.json.resultados.map((x: { id: string }) => x.id)).toEqual(['m4']);
  });

  test('% e _ escritos pela pessoa procuram-se tal e qual', async () => {
    expect((await pesquisar('100% Loja')).json.resultados.map((x: { id: string }) => x.id)).toEqual(['m5']);
    expect((await pesquisar('100%%')).json.resultados).toEqual([]);
    expect((await pesquisar('Loja_do')).json.resultados.map((x: { id: string }) => x.id)).toEqual(['m5']);
    expect((await pesquisar('Loja do')).json.resultados).toEqual([]);
  });

  test('não guarda o histórico de pesquisa', async () => {
    await pesquisar('missão');
    expect(falso.tabelas().search_history).toBeUndefined();
  });
});

describe('pesquisa sem acentos (v2)', () => {
  test('"missao", "ACADEMICO" e "portao" encontram "Missão", "Académico" e "Portão"', async () => {
    expect((await pesquisar('missao')).json.resultados.map((x: { id: string }) => x.id)).toEqual([RUA_MISSAO, RUA_SEM_MORADAS]);
    expect((await pesquisar('ACADEMICO')).json.resultados.map((x: { id: string }) => x.id)).toEqual([BAIRRO]);
    expect((await pesquisar('portao')).json.resultados.map((x: { id: string }) => x.id)).toEqual(['m1']);
    expect((await pesquisar('rua da missao, 12')).json.resultados.map((x: { id: string }) => x.id)).toEqual(['m1']);
  });

  test('as funções SQL recebem o padrão já escapado e só os estados públicos', async () => {
    await pesquisar('100% Loja');
    const chamadas = falso.rpcsChamadas;
    expect(chamadas.find((c) => c.nome === 'pesquisa_ruas')?.args).toEqual({ p_padrao: '%100\\% Loja%', p_limite: MAX_RESULTADOS });
    expect(chamadas.find((c) => c.nome === 'pesquisa_moradas_por_referencia')?.args).toEqual({
      p_padrao: '%100\\% Loja%',
      p_estados: ['APPROVED', 'OFFICIAL', 'PUBLISHED'],
      p_limite: MAX_RESULTADOS * 3,
    });
  });
});

describe('cartão público (action=cartao, sem sessão)', () => {
  const cartao = async (query: unknown) => {
    const res = await handler(
      new Request(`${URL_SUPABASE_FALSO}/functions/v1/pesquisa?action=cartao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    );
    return { status: res.status, json: await res.json() };
  };

  test('regras: só códigos completos; só aprovadas e não privadas', () => {
    expect(interpretarCodigo(' ao-hua-mnfqr6jw-41 ')).toEqual({ tipo: 'codigo_postal', valor: 'AO-HUA-MNFQR6JW-41' });
    expect(interpretarCodigo('6gxcq6fm+2v')).toEqual({ tipo: 'plus_code', valor: '6GXCQ6FM+2V' });
    expect(interpretarCodigo('Q6FM+2V')).toBeNull();
    expect(interpretarCodigo('Rua da Missão')).toBeNull();
    expect(podeVerPublico({ status: 'APPROVED', visibility_level: 'LIMITED' })).toBe(true);
    expect(podeVerPublico({ status: 'APPROVED', visibility_level: 'PRIVATE' })).toBe(false);
    expect(podeVerPublico({ status: 'PROPOSED', visibility_level: 'PUBLIC' })).toBe(false);
    expect(Object.keys(cartaoPublico(MORADAS[0] as any, 'Rua', 'Q'))).toEqual(['postal_code', 'plus_code', 'house_number', 'reference', 'rua', 'quadra']);
  });

  test('pelo código postal: mostra a morada, sem posição exata nem quem criou', async () => {
    const r = await cartao('AO-HUA-MNFQR6JW-41');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      found: true,
      address: {
        postal_code: 'AO-HUA-MNFQR6JW-41',
        plus_code: '6GXCQ6FM+2V',
        house_number: '12',
        reference: 'Portão azul',
        rua: 'Rua da Missão',
        quadra: 'Q-12',
      },
    });
    expect(JSON.stringify(r.json)).not.toMatch(/latitude|created_by|923000000|status/);
  });

  test('pelo Plus Code completo', async () => {
    expect((await cartao('6GXCQ6FM+2V')).json.found).toBe(true);
  });

  test('moradas privadas ou por validar não aparecem', async () => {
    expect((await cartao('AO-HUA-MNFQR6JY-22')).json).toEqual({ found: false }); // privada
    expect((await cartao('AO-HUA-MNFQR6JZ-35')).json).toEqual({ found: false }); // privada (de quem for)
    expect((await cartao('AO-HUA-MNFQR6JX-17')).json).toEqual({ found: false }); // por validar
  });

  test('texto livre ou código incompleto: 400 (nada de pesquisas abertas sem sessão)', async () => {
    expect((await cartao('missão')).status).toBe(400);
    expect((await cartao('Q6FM+2V')).status).toBe(400);
    expect((await cartao(null)).status).toBe(400);
  });
});
