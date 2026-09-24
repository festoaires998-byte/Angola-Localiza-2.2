// Supabase falso, em memória, para correr as Edge Functions (Deno) dentro do Jest.
// Só implementa o que as funções usam: from() com filtros simples, rpc(),
// auth.getUser(), auth.admin.getUserById() e storage (download e links).
// O ilike segue o Postgres: % e _ são curingas e \ escapa o que vem a seguir.

type Linha = Record<string, any>;
type Filtro = (l: Linha) => boolean;

export interface OpcoesSupabaseFalso {
  tabelas?: Record<string, Linha[]>;
  /** token → id do utilizador */
  sessoes?: Record<string, string>;
  emails?: Record<string, string>;
  rpc?: Record<string, (args: any, tabelas: Record<string, Linha[]>) => any>;
  /** Valores por omissão de cada tabela ao inserir (como os DEFAULT da base de dados). */
  predefinicoes?: Record<string, (l: Linha) => Linha>;
  /** bucket → nome do ficheiro → conteúdo */
  ficheiros?: Record<string, Record<string, Uint8Array>>;
}

let contador = 0;
function novoId() {
  contador += 1;
  return `00000000-0000-4000-8000-${String(contador).padStart(12, '0')}`;
}

/** Padrão do ilike (%, _ e \ para escapar) → expressão regular. */
export function ilikeParaRegex(padrao: string): string {
  let re = '';
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === '\\' && i + 1 < padrao.length) re += padrao[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') re += '.*';
    else if (c === '_') re += '.';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

const copia = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function criarSupabaseFalso(opcoes: OpcoesSupabaseFalso = {}) {
  const tabelas: Record<string, Linha[]> = copia(opcoes.tabelas ?? {});
  const ficheiros = opcoes.ficheiros ?? {};
  const rpcsChamadas: { nome: string; args: any }[] = [];
  const linksPedidos: { bucket: string; nome: string; segundos: number }[] = [];

  const tabela = (nome: string) => (tabelas[nome] ??= []);

  function juntarRelacoes(nome: string, l: Linha, colunas: string) {
    if (nome === 'deliveries' && colunas.includes('addresses(')) {
      return { ...l, addresses: copia(tabela('addresses').find((a) => a.id === l.address_id) ?? null) };
    }
    return l;
  }

  function construtor(nome: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let valores: Linha | Linha[] | undefined;
    let colunas = '*';
    let devolver = false;
    let opcoesSelect: { count?: string; head?: boolean } = {};
    let limite: number | undefined;
    const filtros: Filtro[] = [];

    function executar(): { data: any; error: any; count?: number } {
      const linhas = tabela(nome);
      if (op === 'insert' || op === 'upsert') {
        const novas = (Array.isArray(valores) ? valores : [valores!]).map((v) => {
          const base = opcoes.predefinicoes?.[nome]?.(v) ?? {};
          return { id: novoId(), ...base, ...copia(v) };
        });
        linhas.push(...novas);
        return { data: devolver ? copia(novas) : null, error: null };
      }
      const escolhidas = linhas.filter((l) => filtros.every((f) => f(l)));
      if (op === 'update') {
        for (const l of escolhidas) Object.assign(l, copia(valores));
        return { data: devolver ? copia(escolhidas) : null, error: null };
      }
      if (op === 'delete') {
        tabelas[nome] = linhas.filter((l) => !escolhidas.includes(l));
        return { data: null, error: null };
      }
      if (opcoesSelect.head) return { data: null, error: null, count: escolhidas.length };
      const resultado = escolhidas.slice(0, limite).map((l) => juntarRelacoes(nome, copia(l), colunas));
      return { data: resultado, error: null, count: escolhidas.length };
    }

    const b: any = {
      select(c = '*', o: typeof opcoesSelect = {}) {
        colunas = c;
        opcoesSelect = o;
        if (op !== 'select') devolver = true;
        return b;
      },
      insert(v: Linha | Linha[]) { op = 'insert'; valores = v; return b; },
      upsert(v: Linha | Linha[]) { op = 'upsert'; valores = v; return b; },
      update(v: Linha) { op = 'update'; valores = v; return b; },
      delete() { op = 'delete'; return b; },
      eq(c: string, v: unknown) { filtros.push((l) => l[c] === v); return b; },
      neq(c: string, v: unknown) { filtros.push((l) => l[c] !== v); return b; },
      in(c: string, v: unknown[]) { filtros.push((l) => v.includes(l[c])); return b; },
      is(c: string, v: unknown) { filtros.push((l) => (l[c] ?? null) === v); return b; },
      not(c: string, o: string, v: unknown) {
        if (o !== 'is') throw new Error(`not(${o}) não implementado`);
        filtros.push((l) => (l[c] ?? null) !== v);
        return b;
      },
      gte(c: string, v: any) { filtros.push((l) => l[c] >= v); return b; },
      ilike(c: string, padrao: string) {
        const re = new RegExp(`^${ilikeParaRegex(padrao)}$`, 'is');
        filtros.push((l) => typeof l[c] === 'string' && re.test(l[c]));
        return b;
      },
      order() { return b; },
      limit(n: number) { limite = n; return b; },
      single() {
        const r = executar();
        const d = Array.isArray(r.data) ? r.data : [];
        return Promise.resolve(d.length === 1 ? { data: d[0], error: null } : { data: null, error: { message: `esperava 1 linha, veio ${d.length}` } });
      },
      maybeSingle() {
        const r = executar();
        const d = Array.isArray(r.data) ? r.data : [];
        if (d.length > 1) return Promise.resolve({ data: null, error: { message: 'mais de uma linha' } });
        return Promise.resolve({ data: d[0] ?? null, error: null });
      },
      then(ok: (v: any) => any, erro?: (e: any) => any) {
        return Promise.resolve(executar()).then(ok, erro);
      },
    };
    return b;
  }

  const cliente = {
    from: (nome: string) => construtor(nome),
    rpc(nome: string, args: any) {
      rpcsChamadas.push({ nome, args });
      const f = opcoes.rpc?.[nome];
      if (!f) return Promise.resolve({ data: null, error: { message: `rpc ${nome} não existe` } });
      return Promise.resolve({ data: f(args, tabelas), error: null });
    },
    auth: {
      getUser(token: string) {
        const id = opcoes.sessoes?.[token];
        return Promise.resolve({ data: { user: id ? { id } : null }, error: id ? null : { message: 'sessao' } });
      },
      admin: {
        getUserById(id: string) {
          return Promise.resolve({ data: { user: { id, email: opcoes.emails?.[id] } }, error: null });
        },
      },
    },
    storage: {
      from(bucket: string) {
        return {
          download(nome: string) {
            const f = ficheiros[bucket]?.[nome];
            return Promise.resolve(f ? { data: new Blob([new Uint8Array(f)]), error: null } : { data: null, error: { message: 'Object not found' } });
          },
          createSignedUrl(nome: string, segundos: number) {
            linksPedidos.push({ bucket, nome, segundos });
            return Promise.resolve({ data: { signedUrl: `https://assinado/${bucket}/${nome}?s=${segundos}` }, error: null });
          },
        };
      },
    },
  };

  return { cliente, tabelas: () => tabelas, rpcsChamadas, linksPedidos };
}

export type SupabaseFalso = ReturnType<typeof criarSupabaseFalso>;

export const URL_SUPABASE_FALSO = 'https://projeto.supabase.co';

/**
 * Carrega o index.ts de uma Edge Function e devolve o handler que ela passa a
 * Deno.serve. Quem chama tem de ter feito jest.mock dos imports "jsr:" (virtual)
 * para usar globalThis.__supabaseFalso.
 */
export function carregarFuncao(carregar: () => void): (req: Request) => Promise<Response> {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  (globalThis as any).Deno = {
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h;
    },
    env: {
      get: (k: string) => ({ SUPABASE_URL: URL_SUPABASE_FALSO, SUPABASE_SERVICE_ROLE_KEY: 'chave-de-teste' })[k],
    },
  };
  carregar();
  if (!handler) throw new Error('a função não chamou Deno.serve');
  return handler;
}

/** Faz um pedido POST à função, como a app e o site fazem. */
export async function pedir(
  handler: (req: Request) => Promise<Response>,
  acao: string | null,
  corpo: unknown,
  token: string | null = 'token-a',
): Promise<{ status: number; json: any }> {
  const url = `${URL_SUPABASE_FALSO}/functions/v1/deliveries${acao ? `?action=${acao}` : ''}`;
  const res = await handler(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    }),
  );
  return { status: res.status, json: await res.json() };
}
