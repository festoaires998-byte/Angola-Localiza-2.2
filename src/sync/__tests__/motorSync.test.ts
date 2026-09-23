/**
 * @jest-environment node
 */
import { describe, expect, test } from '@jest/globals';
import { p256 } from '@noble/curves/nist.js';
import { createHash } from 'crypto';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioFicheirosPendentes } from '@/database/repositories/ficheirosPendentes';
import { criarRepositorioFilaSaida, type TipoOperacao } from '@/database/repositories/filaSaida';
import { criarRepositorioChavesDispositivo } from '@/database/repositories/chavesDispositivo';
import { criarRepositorioProvasEvidencia } from '@/database/repositories/provasEvidencia';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import {
  criarAssinarProva,
  paraCamposProva,
  provaAssinadaCom,
} from '@/services/crypto/assinarProva';
import {
  criarChaveDispositivo,
  type EstadoChaves,
  type ResultadoRegisto,
} from '@/services/crypto/chaveDispositivo';
import { chavePublicaParaJwk } from '@/services/crypto/jwk';

import {
  AVISO_ASSINATURA_NAO_CONFERE,
  criarMotorSync,
  ERRO_FOTO_ALTERADA,
  type DependenciasMotor,
  ErroSessaoInvalida,
  MENSAGENS,
  type SessaoSync,
} from '../nucleoMotor';

const URL = 'https://teste.supabase.co';
const ANA: SessaoSync = { userId: 'u-ana', accessToken: 'token-ana', expiraEm: null };
const BETO: SessaoSync = { userId: 'u-beto', accessToken: 'token-beto', expiraEm: null };

interface Pedido {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}

type Resposta = { estado: number; corpo?: unknown } | 'sem-rede';
type Responder = (p: Pedido) => Resposta | Promise<Resposta>;

const eSync = (p: Pedido) => p.url === `${URL}/functions/v1/sync`;
const eStorage = (p: Pedido) => p.url.startsWith(`${URL}/storage/v1/object/`);
const idsEnviados = (p: Pedido) =>
  (p.corpo as { operations: { operation_id: string }[] }).operations.map((o) => o.operation_id);

/** Resposta normal: Storage aceita; sync devolve SYNCED para todas. */
const respostaNormal: Responder = (p) => {
  if (eStorage(p)) return { estado: 200, corpo: { Key: 'ok' } };
  return { estado: 200, corpo: { results: idsEnviados(p).map((id) => ({ operation_id: id, status: 'SYNCED' })) } };
};

function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

/** Chave do aparelho de teste (a registada no servidor falso). */
const CHAVE_TESTE = p256.keygen();
const JWK_TESTE = chavePublicaParaJwk(CHAVE_TESTE.publicKey);
const CHAVE_OK: ResultadoRegisto = { tipo: 'ok', deviceId: 'app-teste', jwk: JWK_TESTE };

async function provaAssinada(chavePrivada: Uint8Array = CHAVE_TESTE.secretKey, deviceId = 'app-teste') {
  const assinar = criarAssinarProva(
    { assinar: async (m) => ({ deviceId, assinatura: p256.sign(m, chavePrivada) }) },
    () => new Date('2026-09-23T09:59:00.000Z'),
  );
  const prova = await assinar({
    delivery_id: 'd1',
    lat: -8.8383,
    lng: 13.2344,
    plus_code: '6CVJ5QP7+M9',
    foto_sha256: null,
    assinatura_manuscrita_sha256: null,
  });
  return { delivery_id: 'd1', new_status: 'DELIVERED', pin: '1234', proof: paraCamposProva(prova) };
}

async function montar(opcoes: { tamanhoLote?: number } = {}) {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  let agora = new Date('2026-09-23T10:00:00.000Z');
  const relogio = () => agora;
  let n = 0;
  const gerarId = () => `op-${String(++n).padStart(3, '0')}`;
  const fila = criarRepositorioFilaSaida(db, { deviceId: 'app-teste', relogio, gerarId });
  const ficheiros = criarRepositorioFicheirosPendentes(db, { relogio });
  const evidencias = criarRepositorioProvasEvidencia(db, relogio);
  const disco = new Map<string, Uint8Array>();
  const pedidos: Pedido[] = [];
  const ctx = {
    sessao: ANA as SessaoSync | null,
    online: true,
    responder: respostaNormal,
    /** O que o registo falso da chave devolve. */
    chave: CHAVE_OK,
    /** Chaves vistas pelo motor (falso): a local ainda não está no servidor. */
    chaves: { deviceId: 'app-teste', local: JWK_TESTE, noServidor: {} } as EstadoChaves,
    /** Pedidos HTTP já feitos quando o motor pediu o registo da chave. */
    registosChave: [] as number[],
    /** Chave de assinatura usada pelo motor (trocável por uma real). */
    chaveAssinatura: null as unknown as DependenciasMotor['chaveAssinatura'],
    renovacoes: 0,
    renovar: async (): Promise<SessaoSync | null> => {
      // Como o supabase-js: a sessão renovada passa a ser a sessão guardada.
      ctx.sessao = { ...ANA, accessToken: 'token-novo', expiraEm: null };
      return ctx.sessao;
    },
  };
  ctx.chaveAssinatura = {
    estado: async () => ({ ...ctx.chaves, noServidor: { ...ctx.chaves.noServidor } }),
    garantirRegistada: async () => {
      ctx.registosChave.push(pedidos.length);
      if (ctx.chave.tipo === 'ok') ctx.chaves.noServidor['app-teste'] = ctx.chaves.local!;
      return ctx.chave;
    },
  };

  const motor = criarMotorSync({
    fila,
    ficheiros,
    obterSessao: async () => ctx.sessao,
    renovarSessao: async () => {
      ctx.renovacoes++;
      return ctx.renovar();
    },
    estaOnline: async () => ctx.online,
    chaveAssinatura: {
      estado: (u) => ctx.chaveAssinatura.estado(u),
      garantirRegistada: (s) => ctx.chaveAssinatura.garantirRegistada(s),
    },
    evidencias,
    lerFicheiro: async (c) => disco.get(c) ?? null,
    apagarFicheiro: async (c) => {
      disco.delete(c);
    },
    fetch: (async (url: string, init: RequestInit) => {
      const cabecalhos = init.headers as Record<string, string>;
      const corpo =
        typeof init.body === 'string' ? JSON.parse(init.body) : (init.body as unknown);
      const pedido: Pedido = { url, metodo: String(init.method), cabecalhos, corpo };
      pedidos.push(pedido);
      const r = await ctx.responder(pedido);
      if (r === 'sem-rede') throw new TypeError('Network request failed');
      return {
        ok: r.estado >= 200 && r.estado < 300,
        status: r.estado,
        text: async () => (r.corpo === undefined ? '' : JSON.stringify(r.corpo)),
      } as Response;
    }) as unknown as typeof fetch,
    config: { url: URL, chaveAnon: 'chave-anon' },
    relogio,
    tamanhoLote: opcoes.tamanhoLote,
  });

  async function operacao(tipo: TipoOperacao = 'create_address', payload: unknown = {}, userId = ANA.userId) {
    return fila.adicionar(userId, tipo, payload);
  }

  async function foto(
    id: string,
    operationId: string,
    opcoesFoto: { bytes?: Uint8Array; contentType?: string; sha256?: string | null; bucket?: string } = {},
  ) {
    const bytes = opcoesFoto.bytes ?? new Uint8Array(Buffer.from(`foto ${id}`));
    const caminho = `fotos/${id}.bin`;
    disco.set(caminho, bytes);
    await ficheiros.registar({
      id,
      caminho_local: caminho,
      bucket: opcoesFoto.bucket ?? 'address-photos',
      content_type: opcoesFoto.contentType ?? 'image/jpeg',
      sha256:
        opcoesFoto.sha256 === undefined
          ? createHash('sha256').update(bytes).digest('hex')
          : opcoesFoto.sha256,
      operation_id: operationId,
    });
    return caminho;
  }

  return {
    db,
    fila,
    ficheiros,
    evidencias,
    disco,
    pedidos,
    ctx,
    motor,
    operacao,
    foto,
    avancar(ms: number) {
      agora = new Date(agora.getTime() + ms);
    },
    pedidosSync: () => pedidos.filter(eSync),
    pedidosStorage: () => pedidos.filter(eStorage),
  };
}

describe('fotos', () => {
  test('a foto é enviada e o payload na fila fica com o URL real (antes do POST)', async () => {
    const t = await montar();
    const op = await t.operacao('delivery_proof', {
      delivery_id: 'd1',
      photo_facade_url: 'offline:f1',
      proof: { photo_url: 'offline:f1', signature_url: 'offline:f2', nota: 'x' },
    });
    await t.foto('f1', op.operation_id);
    await t.foto('f2', op.operation_id, { contentType: 'image/png', bucket: 'delivery-proofs' });

    let payloadNaFilaDuranteOPost: unknown = null;
    t.ctx.responder = async (p) => {
      if (eSync(p)) payloadNaFilaDuranteOPost = (await t.fila.obter(op.operation_id))!.payload;
      return respostaNormal(p);
    };

    const r = await t.motor.sincronizar();

    const urlF1 = `${URL}/storage/v1/object/public/address-photos/offline-f1.jpg`;
    const urlF2 = `${URL}/storage/v1/object/public/delivery-proofs/offline-f2.png`;
    const esperado = {
      delivery_id: 'd1',
      photo_facade_url: urlF1,
      proof: { photo_url: urlF1, signature_url: urlF2, nota: 'x' },
    };
    // Cada ficheiro sobe uma vez, com o nome e o tipo certos.
    expect(t.pedidosStorage().map((p) => [p.url, p.cabecalhos['Content-Type']])).toEqual([
      [`${URL}/storage/v1/object/address-photos/offline-f1.jpg`, 'image/jpeg'],
      [`${URL}/storage/v1/object/delivery-proofs/offline-f2.png`, 'image/png'],
    ]);
    expect(t.pedidosStorage()[0].cabecalhos.Authorization).toBe('Bearer token-ana');
    expect(payloadNaFilaDuranteOPost).toEqual(esperado);
    expect((t.pedidosSync()[0].corpo as { operations: { payload: unknown }[] }).operations[0].payload).toEqual(esperado);
    expect(await t.ficheiros.obter('f2')).toBeNull(); // concluída → registo apagado
    expect(r).toMatchObject({ motivo: 'ok', enviadas: 1, concluidas: 1, adiadas: 0 });
  });

  test('a foto que falha deixa a sua operação pendente e as outras seguem', async () => {
    const t = await montar();
    const comFoto = await t.operacao('field_submit', { photo_qr_url: 'offline:f1' });
    const semFoto = await t.operacao('create_address', { nome: 'Rua 1' });
    await t.foto('f1', comFoto.operation_id);
    t.ctx.responder = (p) => (eStorage(p) ? { estado: 500, corpo: { error: 'falhou' } } : respostaNormal(p));

    const r = await t.motor.sincronizar();

    expect(t.pedidosSync().map(idsEnviados)).toEqual([[semFoto.operation_id]]);
    expect((await t.fila.obter(semFoto.operation_id))!.estado).toBe('concluida');
    const presa = (await t.fila.obter(comFoto.operation_id))!;
    expect(presa).toMatchObject({ estado: 'pendente', tentativas: 1 });
    expect(presa.ultimo_erro).toContain('500');
    expect(presa.proxima_tentativa_em).not.toBeNull();
    expect(presa.payload).toEqual({ photo_qr_url: 'offline:f1' });
    expect(t.disco.has('fotos/f1.bin')).toBe(true);
    expect((await t.ficheiros.obter('f1'))!.estado).toBe('pendente');
    expect(r).toMatchObject({ concluidas: 1, adiadas: 1 });
    expect(t.motor.estado.obter().ultimoErro).toBe(MENSAGENS.foto);
  });

  test.each<[string, { estado: number; corpo?: unknown }]>([
    ['409', { estado: 409, corpo: { error: 'Duplicate', message: 'The resource already exists' } }],
    ['400 com statusCode "409" no corpo', { estado: 400, corpo: { statusCode: '409', error: 'Duplicate' } }],
  ])('a resposta %s do Storage conta como sucesso', async (_n, resposta) => {
    const t = await montar();
    const op = await t.operacao('field_submit', { photo_facade_url: 'offline:f1' });
    await t.foto('f1', op.operation_id);
    t.ctx.responder = (p) => (eStorage(p) ? resposta : respostaNormal(p));

    await t.motor.sincronizar();

    const enviado = (t.pedidosSync()[0].corpo as { operations: { payload: unknown }[] }).operations[0];
    expect(enviado.payload).toEqual({
      photo_facade_url: `${URL}/storage/v1/object/public/address-photos/offline-f1.jpg`,
    });
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
  });

  test('o sha256 diferente não é enviado: falha de vez e o ficheiro fica como evidência', async () => {
    const t = await montar();
    const op = await t.operacao('field_submit', { photo_facade_url: 'offline:f1' });
    const outra = await t.operacao('create_address', { nome: 'Rua 3' });
    await t.foto('f1', op.operation_id, { sha256: createHash('sha256').update('outra coisa').digest('hex') });

    const r = await t.motor.sincronizar();

    // Não sobe para o Storage e não vai no POST; as outras seguem.
    expect(t.pedidosStorage()).toHaveLength(0);
    expect(t.pedidosSync().map(idsEnviados)).toEqual([[outra.operation_id]]);
    expect(await t.fila.obter(op.operation_id)).toMatchObject({
      estado: 'falhou_definitivo',
      ultimo_erro: ERRO_FOTO_ALTERADA,
      proxima_tentativa_em: null,
      payload: { photo_facade_url: 'offline:f1' },
    });
    expect(ERRO_FOTO_ALTERADA).toBe('A foto foi alterada ou danificada depois de ser tirada');
    expect(r).toMatchObject({ definitivas: 1, adiadas: 0, concluidas: 1 });
    expect(t.motor.estado.obter().ultimoErro).toBe(MENSAGENS.fotoAlterada);

    // Aparece na lista de operações com problema do utilizador (e só do dele).
    expect((await t.fila.listarFalhadasDoUtilizador(ANA.userId)).map((o) => o.operation_id)).toEqual([
      op.operation_id,
    ]);
    expect(await t.fila.listarFalhadasDoUtilizador(BETO.userId)).toEqual([]);
    // Já não conta como foto por enviar.
    expect(await t.ficheiros.contarPendentesDoUtilizador(ANA.userId)).toBe(0);

    // Nem com forcar volta a ser tentada; e o ficheiro local nunca é apagado,
    // mesmo depois da limpeza das concluídas antigas.
    await t.motor.sincronizar({ forcar: true });
    t.avancar(30 * 24 * 60 * 60 * 1000);
    await t.motor.sincronizar({ forcar: true });
    expect(t.pedidosStorage()).toHaveLength(0);
    expect(t.pedidosSync()).toHaveLength(1);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('falhou_definitivo');
    expect(t.disco.has('fotos/f1.bin')).toBe(true);
    expect(await t.ficheiros.obter('f1')).toMatchObject({ estado: 'pendente' });
  });

  test('marcarFalhouDefinitivo só mexe em operações por enviar do próprio utilizador', async () => {
    const t = await montar();
    const doBeto = await t.operacao('create_address', {}, BETO.userId);
    const concluida = await t.operacao();
    await t.motor.sincronizar();
    expect((await t.fila.obter(concluida.operation_id))!.estado).toBe('concluida');

    await t.fila.marcarFalhouDefinitivo(ANA.userId, doBeto.operation_id, 'x');
    await t.fila.marcarFalhouDefinitivo(ANA.userId, concluida.operation_id, 'x');
    expect((await t.fila.obter(doBeto.operation_id))!.estado).toBe('pendente');
    expect((await t.fila.obter(concluida.operation_id))!.estado).toBe('concluida');
  });

  test('o sha256 em maiúsculas também é aceite', async () => {
    const t = await montar();
    const op = await t.operacao('field_submit', { photo_facade_url: 'offline:f1' });
    const bytes = new Uint8Array([1, 2, 3]);
    await t.foto('f1', op.operation_id, {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    });
    await t.motor.sincronizar();
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
  });

  test('uma foto já enviada numa volta anterior não é enviada outra vez', async () => {
    const t = await montar();
    const op = await t.operacao('field_submit', { photo_facade_url: 'offline:f1' });
    await t.foto('f1', op.operation_id);
    t.ctx.responder = (p) => (eSync(p) ? 'sem-rede' : respostaNormal(p));
    await t.motor.sincronizar();
    expect(t.pedidosStorage()).toHaveLength(1);

    t.ctx.responder = respostaNormal;
    await t.motor.sincronizar({ forcar: true });
    expect(t.pedidosStorage()).toHaveLength(1);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
  });
});

describe('resultados do sync', () => {
  test('FAILED e ausente ficam pendentes; SYNCED e CONFLICT ficam concluidas', async () => {
    const t = await montar();
    const [a, b, c, d] = [
      await t.operacao(),
      await t.operacao(),
      await t.operacao(),
      await t.operacao(),
    ];
    t.ctx.responder = () => ({
      estado: 200,
      corpo: {
        results: [
          { operation_id: a.operation_id, status: 'SYNCED' },
          { operation_id: b.operation_id, status: 'CONFLICT' },
          { operation_id: c.operation_id, status: 'FAILED', error: 'morada nao encontrada' },
        ],
      },
    });

    const r = await t.motor.sincronizar();

    expect((await t.fila.obter(a.operation_id))!.estado).toBe('concluida');
    expect((await t.fila.obter(b.operation_id))!.estado).toBe('concluida');
    expect(await t.fila.obter(c.operation_id)).toMatchObject({
      estado: 'pendente',
      tentativas: 1,
      ultimo_erro: 'morada nao encontrada',
    });
    expect(await t.fila.obter(d.operation_id)).toMatchObject({ estado: 'pendente', tentativas: 1 });
    expect(r).toMatchObject({ enviadas: 4, concluidas: 2, adiadas: 2 });
    expect(t.motor.estado.obter().ultimoErro).toBe(MENSAGENS.recusadas);
  });

  test('um erro de rede não perde nada', async () => {
    const t = await montar();
    const op = await t.operacao('delivery_proof', { proof: { photo_url: 'offline:f1' } });
    await t.foto('f1', op.operation_id);
    const outra = await t.operacao('create_address', { nome: 'Rua 2' });
    t.ctx.responder = (p) => (eSync(p) ? 'sem-rede' : respostaNormal(p));

    const r = await t.motor.sincronizar();

    expect(r.motivo).toBe('erro_rede');
    for (const id of [op.operation_id, outra.operation_id]) {
      expect(await t.fila.obter(id)).toMatchObject({ estado: 'pendente', tentativas: 1 });
    }
    expect((await t.fila.obter(outra.operation_id))!.payload).toEqual({ nome: 'Rua 2' });
    // A foto subiu e o URL ficou guardado; o ficheiro local continua lá.
    expect((await t.fila.obter(op.operation_id))!.payload).toEqual({
      proof: { photo_url: `${URL}/storage/v1/object/public/address-photos/offline-f1.jpg` },
    });
    expect(t.disco.has('fotos/f1.bin')).toBe(true);
    expect(await t.ficheiros.obter('f1')).toMatchObject({ estado: 'enviado' });
    expect(t.motor.estado.obter().ultimoErro).toBe(MENSAGENS.semServidor);
    expect(t.motor.estado.obter().ultimaSincronizacao).toBeNull();
  });

  test('um erro 500 conta como tentativa falhada e não perde nada', async () => {
    const t = await montar();
    const op = await t.operacao();
    t.ctx.responder = () => ({ estado: 500, corpo: { error: 'boom' } });
    const r = await t.motor.sincronizar();
    expect(r.motivo).toBe('erro_servidor');
    expect(await t.fila.obter(op.operation_id)).toMatchObject({ estado: 'pendente', tentativas: 1 });
    expect(t.motor.estado.obter().ultimoErro).toBe(MENSAGENS.servidor);
  });
});

describe('sessão', () => {
  test('um 401 não soma tentativas e marca precisaEntrarDeNovo', async () => {
    const t = await montar();
    const op = await t.operacao();
    t.ctx.responder = (p) =>
      eSync(p) ? { estado: 401, corpo: { error: 'sessao invalida - inicia sessao novamente' } } : respostaNormal(p);

    const r = await t.motor.sincronizar();

    expect(r.motivo).toBe('precisa_entrar');
    expect(await t.fila.obter(op.operation_id)).toMatchObject({
      estado: 'pendente',
      tentativas: 0,
      proxima_tentativa_em: null,
      ultimo_erro: null,
    });
    expect(t.motor.estado.obter()).toMatchObject({
      precisaEntrarDeNovo: true,
      ultimoErro: MENSAGENS.sessao,
    });

    // Com o mesmo token não volta a tentar.
    await t.motor.sincronizar({ forcar: true });
    expect(t.pedidosSync()).toHaveLength(1);

    // Depois de entrar de novo (token novo), envia e limpa o aviso.
    t.ctx.sessao = { ...ANA, accessToken: 'token-depois-de-entrar' };
    t.ctx.responder = respostaNormal;
    await t.motor.sincronizar();
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
    expect(t.motor.estado.obter()).toMatchObject({ precisaEntrarDeNovo: false, ultimoErro: null });
  });

  test('um 401 do Storage também pára sem somar tentativas', async () => {
    const t = await montar();
    const op = await t.operacao('field_submit', { photo_facade_url: 'offline:f1' });
    await t.foto('f1', op.operation_id);
    t.ctx.responder = (p) => (eStorage(p) ? { estado: 401 } : respostaNormal(p));
    const r = await t.motor.sincronizar();
    expect(r.motivo).toBe('precisa_entrar');
    expect(t.pedidosSync()).toHaveLength(0);
    expect(await t.fila.obter(op.operation_id)).toMatchObject({ estado: 'pendente', tentativas: 0 });
    expect(t.motor.estado.obter().precisaEntrarDeNovo).toBe(true);
  });

  test('renova o token antes de enviar se estiver a expirar', async () => {
    const t = await montar();
    await t.operacao();
    t.ctx.sessao = { ...ANA, expiraEm: new Date('2026-09-23T10:00:30.000Z').getTime() };
    await t.motor.sincronizar();
    expect(t.ctx.renovacoes).toBe(1);
    expect(t.pedidosSync()[0].cabecalhos.Authorization).toBe('Bearer token-novo');
  });

  test('se a renovação for recusada, pára e pede para entrar de novo', async () => {
    const t = await montar();
    const op = await t.operacao();
    t.ctx.sessao = { ...ANA, expiraEm: new Date('2026-09-23T09:00:00.000Z').getTime() };
    t.ctx.renovar = async () => {
      throw new ErroSessaoInvalida('Invalid Refresh Token');
    };
    const r = await t.motor.sincronizar();
    expect(r.motivo).toBe('precisa_entrar');
    expect(t.pedidos).toHaveLength(0);
    expect(await t.fila.obter(op.operation_id)).toMatchObject({ estado: 'pendente', tentativas: 0 });
    expect(t.motor.estado.obter().precisaEntrarDeNovo).toBe(true);
  });

  test('sem sessão ou sem rede não envia nada', async () => {
    const t = await montar();
    await t.operacao();
    t.ctx.sessao = null;
    expect((await t.motor.sincronizar()).motivo).toBe('sem_sessao');
    t.ctx.sessao = ANA;
    t.ctx.online = false;
    expect((await t.motor.sincronizar()).motivo).toBe('sem_rede');
    expect(t.pedidos).toHaveLength(0);
  });

  test('as operações do utilizador A nunca são enviadas com a sessão do B', async () => {
    const t = await montar({ tamanhoLote: 1 });
    const daAna = await t.operacao('create_address', { de: 'ana' }, ANA.userId);
    const doBeto1 = await t.operacao('create_address', { de: 'beto' }, BETO.userId);
    const doBeto2 = await t.operacao('create_address', { de: 'beto' }, BETO.userId);
    t.ctx.sessao = BETO;
    // A meio do envio, a sessão passa a ser da Ana: o lote seguinte não segue.
    t.ctx.responder = (p) => {
      t.ctx.sessao = ANA;
      return respostaNormal(p);
    };

    const r = await t.motor.sincronizar();

    expect(t.pedidosSync()).toHaveLength(1);
    expect(t.pedidosSync()[0].cabecalhos.Authorization).toBe('Bearer token-beto');
    expect(idsEnviados(t.pedidosSync()[0])).toEqual([doBeto1.operation_id]);
    expect(r.motivo).toBe('sessao_mudou');
    expect((await t.fila.obter(daAna.operation_id))!.estado).toBe('pendente');
    expect((await t.fila.obter(doBeto2.operation_id))!.estado).toBe('pendente');

    // Na volta seguinte, com a sessão da Ana, só vão as da Ana, com o token da Ana.
    t.ctx.responder = respostaNormal;
    await t.motor.sincronizar();
    const ultimo = t.pedidosSync()[1];
    expect(ultimo.cabecalhos.Authorization).toBe('Bearer token-ana');
    expect(idsEnviados(ultimo)).toEqual([daAna.operation_id]);
    expect((await t.fila.obter(doBeto2.operation_id))!.estado).toBe('pendente');
  });
});

describe('um envio de cada vez', () => {
  test('dois pedidos ao mesmo tempo dão um só envio, mais uma volta no fim', async () => {
    const t = await montar();
    const primeira = await t.operacao();
    let emCurso = 0;
    let maximo = 0;
    const porta = adiado<void>();
    t.ctx.responder = async (p) => {
      emCurso++;
      maximo = Math.max(maximo, emCurso);
      if (t.pedidosSync().length === 1) await porta.promessa;
      emCurso--;
      return respostaNormal(p);
    };

    const p1 = t.motor.sincronizar();
    // Espera o primeiro POST começar.
    while (t.pedidosSync().length === 0) await new Promise((r) => setImmediate(r));
    expect(t.motor.estado.obter().aSincronizar).toBe(true);
    const segunda = await t.operacao();
    const p2 = t.motor.sincronizar();
    const p3 = t.motor.sincronizar();
    expect(t.pedidosSync()).toHaveLength(1);
    porta.resolver();
    await Promise.all([p1, p2, p3]);

    expect(maximo).toBe(1);
    // 1.º envio + UMA volta extra (e não duas, apesar de dois pedidos).
    expect(t.pedidosSync().map(idsEnviados)).toEqual([[primeira.operation_id], [segunda.operation_id]]);
    expect(t.motor.estado.obter().aSincronizar).toBe(false);
  });

  test('ao arrancar pela primeira vez liberta as operações presas em "a_enviar"', async () => {
    const t = await montar();
    const op = await t.operacao();
    await t.fila.marcarAEnviar(ANA.userId, [op.operation_id]);
    await t.motor.sincronizar();
    expect(idsEnviados(t.pedidosSync()[0])).toEqual([op.operation_id]);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
  });

  test('envia em lotes de 20', async () => {
    const t = await montar();
    for (let i = 0; i < 45; i++) await t.operacao();
    await t.motor.sincronizar();
    expect(t.pedidosSync().map((p) => idsEnviados(p).length)).toEqual([20, 20, 5]);
  });
});

describe('forcar', () => {
  test('sem forcar respeita a espera; com forcar ignora-a', async () => {
    const t = await montar();
    const op = await t.operacao();
    t.ctx.responder = () => 'sem-rede';
    await t.motor.sincronizar();
    expect(t.pedidosSync()).toHaveLength(1);

    t.ctx.responder = respostaNormal;
    t.avancar(10_000); // a espera depois da 1.ª falha é de 30 s
    await t.motor.sincronizar();
    expect(t.pedidosSync()).toHaveLength(1);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('pendente');

    await t.motor.sincronizar({ forcar: true });
    expect(t.pedidosSync()).toHaveLength(2);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
  });

  test('com forcar, uma operação que falha não é repetida na mesma volta', async () => {
    const t = await montar();
    await t.operacao();
    t.ctx.responder = () => ({ estado: 200, corpo: { results: [] } });
    await t.motor.sincronizar({ forcar: true });
    expect(t.pedidosSync()).toHaveLength(1);
  });
});

describe('ficheiros locais', () => {
  test('o ficheiro local só é apagado depois de a operação ficar concluida', async () => {
    const t = await montar();
    const op = await t.operacao('delivery_proof', { proof: { signature_url: 'offline:f1' } });
    await t.foto('f1', op.operation_id, { contentType: 'image/png' });

    // 1.ª volta: a foto sobe mas o servidor devolve FAILED → a prova fica.
    t.ctx.responder = (p) =>
      eSync(p)
        ? { estado: 200, corpo: { results: [{ operation_id: op.operation_id, status: 'FAILED', error: 'x' }] } }
        : respostaNormal(p);
    await t.motor.sincronizar();
    expect(t.disco.has('fotos/f1.bin')).toBe(true);
    expect(await t.ficheiros.obter('f1')).toMatchObject({ estado: 'enviado' });

    // 2.ª volta: concluída → só agora o ficheiro e o registo são apagados.
    t.ctx.responder = respostaNormal;
    await t.motor.sincronizar({ forcar: true });
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
    expect(t.disco.has('fotos/f1.bin')).toBe(false);
    expect(await t.ficheiros.obter('f1')).toBeNull();
  });

  test('no fim limpa as concluídas antigas e avisa os ecrãs', async () => {
    const t = await montar();
    const op = await t.operacao();
    let avisos = 0;
    t.motor.eventos.ouvir('sincronizado', () => avisos++);
    await t.motor.sincronizar();
    expect(avisos).toBe(1);
    expect(t.motor.estado.obter().ultimaSincronizacao).toBe('2026-09-23T10:00:00.000Z');

    t.avancar(8 * 24 * 60 * 60 * 1000);
    await t.motor.sincronizar();
    expect(await t.fila.obter(op.operation_id)).toBeNull();
    expect(avisos).toBe(2);
  });
});

describe('chave do aparelho e provas de entrega', () => {
  const corpoEnviado = (t: Awaited<ReturnType<typeof montar>>, i = 0) =>
    (t.pedidosSync()[i].corpo as { operations: { payload: unknown }[] }).operations[0].payload;

  test('prova assinada com a chave que o servidor já tem: segue sem pedir registo', async () => {
    const t = await montar();
    t.ctx.chaves.noServidor['app-teste'] = JWK_TESTE;
    const op = await t.operacao('delivery_proof', await provaAssinada());

    await t.motor.sincronizar();

    expect(t.ctx.registosChave).toEqual([]);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
  });

  test('prova assinada com a chave local ainda não registada: regista antes de enviar', async () => {
    const t = await montar();
    const op = await t.operacao('delivery_proof', await provaAssinada());

    const r = await t.motor.sincronizar();

    expect(t.ctx.registosChave).toEqual([0]); // antes de qualquer pedido HTTP
    expect(t.pedidosSync().map(idsEnviados)).toEqual([[op.operation_id]]);
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
    expect(r).toMatchObject({ concluidas: 1, aguardamChave: 0, avisos: 0 });
  });

  test('sem provas assinadas não pede o registo da chave', async () => {
    const t = await montar();
    await t.operacao('create_address', { nome: 'Rua 1' });
    await t.operacao('delivery_proof', { delivery_id: 'd1', new_status: 'FAILED', proof: {} });
    await t.motor.sincronizar();
    expect(t.ctx.registosChave).toEqual([]);
    expect(t.pedidosSync()).toHaveLength(1);
  });

  test('se o registo falhar, a prova espera sem somar tentativas e as outras seguem', async () => {
    const t = await montar();
    const prova = await t.operacao('delivery_proof', await provaAssinada());
    const outra = await t.operacao('create_address', { nome: 'Rua 1' });
    t.ctx.chave = { tipo: 'falhou', erro: 'Sem ligação ao servidor.' };

    const r = await t.motor.sincronizar();

    expect(t.pedidosSync().map(idsEnviados)).toEqual([[outra.operation_id]]);
    expect(await t.fila.obter(prova.operation_id)).toMatchObject({
      estado: 'pendente',
      tentativas: 0,
      ultimo_erro: null,
      proxima_tentativa_em: null,
    });
    expect(r).toMatchObject({ concluidas: 1, adiadas: 1, aguardamChave: 1 });
    expect(t.motor.estado.obter().ultimoErro).toBe(MENSAGENS.chave);

    // Várias voltas sem registo: continua sem tentativas somadas.
    await t.motor.sincronizar();
    await t.motor.sincronizar();
    expect((await t.fila.obter(prova.operation_id))!.tentativas).toBe(0);

    // O registo passa a funcionar: a prova segue logo (não ficou à espera de nenhuma pausa).
    t.ctx.chave = CHAVE_OK;
    await t.motor.sincronizar();
    expect(t.pedidosSync().map(idsEnviados).at(-1)).toEqual([prova.operation_id]);
    expect((await t.fila.obter(prova.operation_id))!.estado).toBe('concluida');
  });

  test('o registo recusado com 401 pára e pede para entrar de novo', async () => {
    const t = await montar();
    const prova = await t.operacao('delivery_proof', await provaAssinada());
    t.ctx.chave = { tipo: 'sessao' };

    const r = await t.motor.sincronizar();

    expect(r.motivo).toBe('precisa_entrar');
    expect(t.pedidosSync()).toEqual([]);
    expect((await t.fila.obter(prova.operation_id))!).toMatchObject({ estado: 'pendente', tentativas: 0 });
    expect(t.motor.estado.obter().precisaEntrarDeNovo).toBe(true);
  });

  test.each([
    ['assinada com outra chave', async () => provaAssinada(p256.keygen().secretKey)],
    ['assinada por outro aparelho', async () => provaAssinada(CHAVE_TESTE.secretKey, 'app-outro')],
    [
      'com o texto alterado depois de assinar',
      async () => {
        const p = await provaAssinada();
        p.proof.crypto_payload = p.proof.crypto_payload.replace('"lat":-8.8383', '"lat":-8.8384');
        return p;
      },
    ],
  ])('a prova %s é enviada na mesma, com a assinatura original, e fica uma cópia local', async (_n, criar) => {
    const t = await montar();
    t.ctx.chaves.noServidor['app-teste'] = JWK_TESTE;
    const payload = await criar();
    const op = await t.operacao('delivery_proof', payload);

    const r = await t.motor.sincronizar();

    // Enviada tal como foi assinada: o servidor verifica e marca crypto_verified = false.
    expect(t.pedidosSync().map(idsEnviados)).toEqual([[op.operation_id]]);
    expect(corpoEnviado(t)).toEqual(payload);
    // Não fica marcada como falhada.
    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
    expect(await t.fila.listarFalhadasDoUtilizador(ANA.userId)).toEqual([]);
    // Cópia local como evidência (sobrevive à limpeza das concluídas).
    expect(await t.evidencias.obter(op.operation_id)).toMatchObject({
      user_id: ANA.userId,
      device_id: 'app-teste',
      payload,
      motivo: AVISO_ASSINATURA_NAO_CONFERE,
    });
    t.avancar(30 * 24 * 60 * 60 * 1000);
    await t.motor.sincronizar();
    expect(await t.fila.obter(op.operation_id)).toBeNull();
    expect(await t.evidencias.listarDoUtilizador(ANA.userId)).toHaveLength(1);
    expect(r).toMatchObject({ concluidas: 1, definitivas: 0, avisos: 1 });
    expect(t.ctx.registosChave).toEqual([]); // não conferir não obriga a registar nada
  });

  test('iPhone restaurado (device_id novo): as provas do aparelho anterior seguem sem aviso', async () => {
    const t = await montar();
    // O SQLite veio do backup: a app sabe que o servidor tem a chave do aparelho anterior.
    const anterior = p256.keygen();
    t.ctx.chaves.noServidor['app-anterior'] = chavePublicaParaJwk(anterior.publicKey);
    const op = await t.operacao('delivery_proof', await provaAssinada(anterior.secretKey, 'app-anterior'));

    const r = await t.motor.sincronizar();

    expect((await t.fila.obter(op.operation_id))!.estado).toBe('concluida');
    expect(await t.evidencias.obter(op.operation_id)).toBeNull();
    expect(t.ctx.registosChave).toEqual([]);
    expect(r).toMatchObject({ avisos: 0 });
  });

  test('a cópia local guarda o payload já com o URL real da foto', async () => {
    const t = await montar();
    t.ctx.chaves.noServidor['app-teste'] = JWK_TESTE;
    const payload = await provaAssinada(p256.keygen().secretKey);
    const op = await t.operacao('delivery_proof', {
      ...payload,
      proof: { ...payload.proof, photo_url: 'offline:f1' },
    });
    await t.foto('f1', op.operation_id, { bucket: 'delivery-proofs' });

    await t.motor.sincronizar();

    const guardada = (await t.evidencias.obter(op.operation_id))!.payload as { proof: Record<string, unknown> };
    expect(guardada.proof.photo_url).toBe(`${URL}/storage/v1/object/public/delivery-proofs/offline-f1.jpg`);
    expect(guardada.proof.crypto_signature).toBe(payload.proof.crypto_signature);
  });
});

describe('chave nova: primeiro as provas da chave antiga, depois o registo (chave real)', () => {
  const DEVICE = 'app-teste';

  /** Liga o motor a uma chave real (criarChaveDispositivo) com cofre em memória. */
  async function montarComChaveReal() {
    const t = await montar();
    const cofre = new Map<string, string>();
    const chaves = criarRepositorioChavesDispositivo(t.db);
    const ordem: string[] = [];
    let registoResponde: 'ok' | string = 'ok';
    const criar = () =>
      criarChaveDispositivo({
        cofre: {
          getItemAsync: async (n) => cofre.get(n) ?? null,
          setItemAsync: async (n, v) => {
            cofre.set(n, v);
          },
          deleteItemAsync: async (n) => {
            cofre.delete(n);
          },
        },
        chaves,
        obterIdDispositivo: async () => DEVICE,
        prepararAleatorio: () => undefined,
        erroDeLeituraEPerda: false,
        obterSessao: async () => ANA,
        estaOnline: async () => true,
        pedirRegisto: async (_token, corpo) => {
          ordem.push(`registo ${corpo.public_key_jwk.x.slice(0, 6)}`);
          return registoResponde;
        },
        haProvasPorEnviarAssinadasCom: async (userId, deviceId, jwk) =>
          (await t.fila.listarPorEnviarDoTipo(userId, 'delivery_proof')).some((op) =>
            provaAssinadaCom(op.payload, deviceId, jwk),
          ),
      });
    let chave = criar();
    t.ctx.chaveAssinatura = {
      estado: (u) => chave.estado(u),
      garantirRegistada: (s) => chave.garantirChaveRegistada(s),
    };
    const responderAntes = t.ctx.responder;
    t.ctx.responder = (p) => {
      if (eSync(p)) ordem.push(`sync ${idsEnviados(p).join(',')}`);
      return responderAntes(p);
    };
    async function prova(deliveryId: string) {
      const assinar = criarAssinarProva(chave, () => new Date('2026-09-23T09:00:00.000Z'));
      const p = await assinar({
        delivery_id: deliveryId,
        lat: -8.8,
        lng: 13.2,
        plus_code: '6CVJ5QP7+M9',
        foto_sha256: null,
        assinatura_manuscrita_sha256: null,
      });
      return t.operacao('delivery_proof', { delivery_id: deliveryId, new_status: 'DELIVERED', proof: paraCamposProva(p) });
    }
    return {
      t,
      chaves,
      ordem,
      prova,
      chavePublica: () => chave.chavePublica(),
      /** A chave privada desaparece (ex.: backup restaurado) e a app reabre. */
      perderChavePrivada() {
        cofre.clear();
        chave = criar();
      },
      registoResponde(r: string) {
        registoResponde = r;
      },
    };
  }

  test('envia as provas da chave antiga, regista a chave nova e envia as novas, numa só sincronização', async () => {
    const c = await montarComChaveReal();
    // A chave antiga foi registada e há uma prova dela por enviar (sem rede na altura).
    const antiga = await c.chavePublica();
    const provaAntiga = await c.prova('d-antiga');
    c.t.ctx.online = false;
    await c.t.motor.sincronizar();
    c.t.ctx.online = true;
    c.registoResponde('ok');
    await c.chaves.registarNoServidor(ANA.userId, DEVICE, antiga.jwk);

    c.perderChavePrivada();
    const provaNova = await c.prova('d-nova'); // gera a chave nova ao assinar
    const nova = await c.chavePublica();
    expect(nova.jwk).not.toEqual(antiga.jwk);

    const r = await c.t.motor.sincronizar();

    expect(c.ordem).toEqual([
      `sync ${provaAntiga.operation_id}`,
      `registo ${nova.jwk.x.slice(0, 6)}`,
      `sync ${provaNova.operation_id}`,
    ]);
    expect((await c.t.fila.obter(provaAntiga.operation_id))!.estado).toBe('concluida');
    expect((await c.t.fila.obter(provaNova.operation_id))!.estado).toBe('concluida');
    expect(await c.chaves.chaveNoServidor(ANA.userId, DEVICE)).toEqual(nova.jwk);
    expect(await c.t.evidencias.listarDoUtilizador(ANA.userId)).toEqual([]); // ambas conferem
    expect(r.motivo).toBe('ok');
  });

  test('se a prova antiga não passar, a chave nova não é registada e a prova nova espera sem tentativas', async () => {
    const c = await montarComChaveReal();
    const antiga = await c.chavePublica();
    await c.chaves.registarNoServidor(ANA.userId, DEVICE, antiga.jwk);
    const provaAntiga = await c.prova('d-antiga');
    c.perderChavePrivada();
    const provaNova = await c.prova('d-nova');
    c.t.ctx.responder = (p) => {
      if (eSync(p)) c.ordem.push(`sync ${idsEnviados(p).join(',')}`);
      return eSync(p) ? { estado: 500, corpo: { error: 'falhou' } } : respostaNormal(p);
    };

    await c.t.motor.sincronizar();

    expect(c.ordem).toEqual([`sync ${provaAntiga.operation_id}`]); // sem registo
    expect(await c.chaves.chaveNoServidor(ANA.userId, DEVICE)).toEqual(antiga.jwk);
    expect((await c.t.fila.obter(provaAntiga.operation_id))!.tentativas).toBe(1);
    expect(await c.t.fila.obter(provaNova.operation_id)).toMatchObject({ estado: 'pendente', tentativas: 0 });

    // O servidor volta: primeiro a antiga, depois o registo, depois a nova.
    c.t.ctx.responder = (p) => {
      if (eSync(p)) c.ordem.push(`sync ${idsEnviados(p).join(',')}`);
      return respostaNormal(p);
    };
    await c.t.motor.sincronizar({ forcar: true });
    expect(c.ordem.slice(1)).toEqual([
      `sync ${provaAntiga.operation_id}`,
      `registo ${(await c.chavePublica()).jwk.x.slice(0, 6)}`,
      `sync ${provaNova.operation_id}`,
    ]);
  });

  test('uma prova da chave antiga que chega depois do registo da nova é enviada com aviso', async () => {
    const c = await montarComChaveReal();
    const antiga = await c.chavePublica();
    await c.chaves.registarNoServidor(ANA.userId, DEVICE, antiga.jwk);
    // Assinada com a chave antiga mas só posta na fila depois (ex.: restaurada de outro lado).
    const payloadAntigo = (await c.prova('d-antiga')).payload;
    await c.t.db.run('DELETE FROM fila_saida');
    c.perderChavePrivada();
    await c.prova('d-nova');
    await c.t.motor.sincronizar();
    expect(await c.chaves.chaveNoServidor(ANA.userId, DEVICE)).toEqual((await c.chavePublica()).jwk);

    const atrasada = await c.t.operacao('delivery_proof', payloadAntigo);
    await c.t.motor.sincronizar();

    expect((await c.t.fila.obter(atrasada.operation_id))!.estado).toBe('concluida');
    expect((await c.t.evidencias.obter(atrasada.operation_id))!.motivo).toBe(AVISO_ASSINATURA_NAO_CONFERE);
  });
});
