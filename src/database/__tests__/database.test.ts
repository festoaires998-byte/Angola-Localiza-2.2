/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, test } from '@jest/globals';

import { aplicarMigracoes, lerVersao, MIGRACOES, type Migracao } from '../migrations';
import {
  criarRepositorioChavesDispositivo,
  criarRepositorioCodigosConfirmados,
  criarRepositorioFavoritos,
  criarRepositorioFicheirosPendentes,
  criarRepositorioFilaSaida,
  criarRepositorioMoradas,
  criarRepositorioPerfilLocal,
  criarRepositorioProvasEvidencia,
  criarRepositorioZonasGeocodificadas,
  idDoMarcador,
  marcadorOffline,
  paraPedidoSync,
  type Morada,
} from '../repositories';
import { criarBaseDadosSqlJs } from '../testes/baseDadosSqlJs';
import type { BaseDados } from '../tipos';

/** Gerador de ids previsível: op-1, op-2, ... */
function geradorSequencial(prefixo: string) {
  let n = 0;
  return () => `${prefixo}-${++n}`;
}

/** Relógio que só anda quando o teste manda. */
function relogioManual(inicio = '2026-09-23T10:00:00.000Z') {
  let agora = new Date(inicio);
  const relogio = () => new Date(agora);
  relogio.avancar = (ms: number) => {
    agora = new Date(agora.getTime() + ms);
  };
  return relogio;
}

/** Utilizador usado nos testes da fila. */
const U = 'utilizador-a';

async function baseMigrada(): Promise<BaseDados> {
  const { db } = await criarBaseDadosSqlJs();
  await aplicarMigracoes(db);
  return db;
}

async function nomesTabelas(db: BaseDados): Promise<string[]> {
  const linhas = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  return linhas.map((l) => l.name);
}

function morada(id: string, latitude: number, longitude: number): Morada {
  return {
    id,
    plus_code: null,
    codigo_postal: null,
    latitude,
    longitude,
    precisao_m: 5,
    provincia: 'Luanda',
    municipio: 'Luanda',
    estado: 'ativa',
    origem: 'zona_offline',
    dados: { rua: 'Rua A' },
    atualizado_em: '2026-09-23T10:00:00.000Z',
  };
}

describe('migrações', () => {
  test('correm do zero e criam todas as tabelas', async () => {
    const { db } = await criarBaseDadosSqlJs();
    expect(await lerVersao(db)).toBe(0);

    const versao = await aplicarMigracoes(db);

    expect(versao).toBe(MIGRACOES.length);
    expect(await lerVersao(db)).toBe(MIGRACOES.length);
    expect(await nomesTabelas(db)).toEqual([
      'chaves_dispositivo',
      'chaves_no_servidor',
      'codigos_confirmados',
      'entregas',
      'favoritos',
      'ficheiros_pendentes',
      'fila_saida',
      'levantamentos',
      'moradas',
      'perfil_local',
      'provas_evidencia',
      'referencias',
      'zona_offline',
      'zonas_geocodificadas',
    ]);
  });

  test('voltar a correr não faz nada', async () => {
    const db = await baseMigrada();
    const antes = await db.getAll('SELECT type, name, sql FROM sqlite_master ORDER BY name');

    await expect(aplicarMigracoes(db)).resolves.toBe(MIGRACOES.length);

    expect(await db.getAll('SELECT type, name, sql FROM sqlite_master ORDER BY name')).toEqual(
      antes,
    );
  });

  test('uma migração que falha a meio não deixa nada feito', async () => {
    const { db } = await criarBaseDadosSqlJs();
    const partida: Migracao = {
      versao: MIGRACOES.length + 1,
      nome: 'partida',
      async aplicar(tx) {
        await tx.exec('CREATE TABLE temporaria (x INTEGER)');
        await tx.exec('ISTO NÃO É SQL');
      },
    };

    await expect(aplicarMigracoes(db, [...MIGRACOES, partida])).rejects.toThrow(
      new RegExp(`Migração ${MIGRACOES.length + 1} \\(partida\\) falhou`),
    );

    expect(await lerVersao(db)).toBe(MIGRACOES.length);
    expect(await nomesTabelas(db)).not.toContain('temporaria');
  });
});

describe('restrições CHECK', () => {
  let db: BaseDados;
  beforeEach(async () => {
    db = await baseMigrada();
  });

  const agora = '2026-09-23T10:00:00.000Z';

  test('fila_saida rejeita operation_type e estado inválidos', async () => {
    const inserir = (tipo: string, estado: string) =>
      db.run(
        `INSERT INTO fila_saida (operation_id, device_id, operation_type, payload_json, estado,
           criado_em, atualizado_em) VALUES (?, 'd1', ?, '{}', ?, ?, ?)`,
        [`op-${tipo}-${estado}`, tipo, estado, agora, agora],
      );

    await expect(inserir('create_address', 'pendente')).resolves.toBeDefined();
    await expect(inserir('apagar_tudo', 'pendente')).rejects.toThrow(/CHECK/);
    await expect(inserir('field_submit', 'perdida')).rejects.toThrow(/CHECK/);
  });

  test('fila_saida rejeita payload que não é JSON', async () => {
    await expect(
      db.run(
        `INSERT INTO fila_saida (operation_id, device_id, operation_type, payload_json,
           criado_em, atualizado_em) VALUES ('x', 'd1', 'field_submit', 'não é json', ?, ?)`,
        [agora, agora],
      ),
    ).rejects.toThrow(/CHECK/);
  });

  test('favoritos, moradas, levantamentos, referencias e chaves rejeitam valores inválidos', async () => {
    await expect(
      db.run(
        `INSERT INTO favoritos (id, morada_id, nome, categoria, atualizado_em)
         VALUES ('f1', 'm1', 'Casa da avó', 'avó', ?)`,
        [agora],
      ),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.run(
        `INSERT INTO moradas (id, latitude, longitude, origem, atualizado_em)
         VALUES ('m1', -8.8, 13.2, 'inventada', ?)`,
        [agora],
      ),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.run(
        `INSERT INTO levantamentos (id, estado, criado_em, atualizado_em)
         VALUES ('l1', 'perdido', ?, ?)`,
        [agora, agora],
      ),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.run(
        `INSERT INTO referencias (tipo, id, nome, atualizado_em) VALUES ('pais', '1', 'Angola', ?)`,
        [agora],
      ),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.run(
        `INSERT INTO chaves_dispositivo (device_id, chave_publica_jwk, registada, criada_em)
         VALUES ('d1', '{}', 2, ?)`,
        [agora],
      ),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.run(
        `INSERT INTO ficheiros_pendentes (id, caminho_local, bucket, content_type, estado, criado_em)
         VALUES ('f1', '/a.jpg', 'fotos', 'image/jpeg', 'enviado', ?)`,
        [agora],
      ),
    ).rejects.toThrow(/CHECK/);
  });

  test('a chave estrangeira de ficheiros_pendentes está ligada', async () => {
    const ficheiros = criarRepositorioFicheirosPendentes(db, { gerarId: () => 'f1' });
    await expect(
      ficheiros.registar({
        caminho_local: '/docs/a.jpg',
        bucket: 'fotos',
        content_type: 'image/jpeg',
        operation_id: 'nao-existe',
      }),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe('fila de saída', () => {
  let db: BaseDados;
  let relogio: ReturnType<typeof relogioManual>;
  let fila: ReturnType<typeof criarRepositorioFilaSaida>;

  beforeEach(async () => {
    db = await baseMigrada();
    relogio = relogioManual();
    fila = criarRepositorioFilaSaida(db, {
      deviceId: 'telemovel-1',
      gerarId: geradorSequencial('op'),
      relogio,
    });
  });

  test('adicionar gera operation_id e usa o device_id recebido', async () => {
    const op = await fila.adicionar(U, 'create_address', { photo_facade_url: 'offline:f1' });

    expect(op.operation_id).toBe('op-1');
    expect(op.device_id).toBe('telemovel-1');
    expect(await fila.obter('op-1')).toMatchObject({
      estado: 'pendente',
      tentativas: 0,
      payload: { photo_facade_url: 'offline:f1' },
    });
    expect(paraPedidoSync([op])).toEqual({
      operations: [
        {
          operation_id: 'op-1',
          device_id: 'telemovel-1',
          operation_type: 'create_address',
          payload: { photo_facade_url: 'offline:f1' },
        },
      ],
    });
  });

  test('aplicarResultadosSync segue a regra do site', async () => {
    await fila.adicionar(U, 'create_address', { n: 1 }); // op-1: OK
    await fila.adicionar(U, 'create_delivery', { n: 2 }); // op-2: FAILED
    await fila.adicionar(U, 'field_submit', { n: 3 }); // op-3: não vem na resposta
    await fila.adicionar(U, 'delivery_proof', { n: 4 }); // op-4: outro estado qualquer
    await fila.marcarAEnviar(U, ['op-1', 'op-2', 'op-3', 'op-4']);
    expect(await fila.contarPendentes()).toBe(4);

    await fila.aplicarResultadosSync(U, [
      { operation_id: 'op-1', status: 'OK' },
      { operation_id: 'op-2', status: 'FAILED', error: 'morada inválida' },
      { operation_id: 'op-4', status: 'DUPLICATE' },
    ]);

    expect(await fila.obter('op-1')).toMatchObject({ estado: 'concluida', tentativas: 0 });
    expect(await fila.obter('op-2')).toMatchObject({
      estado: 'pendente',
      tentativas: 1,
      ultimo_erro: 'morada inválida',
    });
    expect(await fila.obter('op-3')).toMatchObject({ estado: 'pendente', tentativas: 1 });
    expect((await fila.obter('op-3'))?.ultimo_erro).toMatch(/não veio/);
    expect(await fila.obter('op-4')).toMatchObject({ estado: 'concluida' });
    expect(await fila.contarPendentes()).toBe(2);
  });

  test('as que falharam só voltam a estar prontas depois da espera', async () => {
    await fila.adicionar(U, 'create_address', {});
    await fila.marcarAEnviar(U, ['op-1']);
    await fila.aplicarResultadosSync(U, [{ operation_id: 'op-1', status: 'FAILED' }]);

    expect(await fila.listarProntas(U, 10)).toEqual([]);
    relogio.avancar(31_000);
    expect((await fila.listarProntas(U, 10)).map((o) => o.operation_id)).toEqual(['op-1']);
  });

  test('listarProntas respeita o limite e a ordem de chegada', async () => {
    for (let i = 0; i < 5; i++) {
      await fila.adicionar(U, 'field_submit', { i });
      relogio.avancar(1000);
    }
    const prontas = await fila.listarProntas(U, 3);
    expect(prontas.map((o) => o.operation_id)).toEqual(['op-1', 'op-2', 'op-3']);
  });

  test('maxTentativas faz a operação passar a falhou_definitivo', async () => {
    const filaComLimite = criarRepositorioFilaSaida(db, {
      deviceId: 'telemovel-1',
      gerarId: geradorSequencial('lim'),
      relogio,
      maxTentativas: 2,
    });
    await filaComLimite.adicionar(U, 'create_address', {});
    for (let i = 0; i < 2; i++) {
      await filaComLimite.marcarAEnviar(U, ['lim-1']);
      await filaComLimite.aplicarResultadosSync(U, [{ operation_id: 'lim-1', status: 'FAILED' }]);
      relogio.avancar(3_600_000);
    }
    expect(await filaComLimite.obter('lim-1')).toMatchObject({
      estado: 'falhou_definitivo',
      tentativas: 2,
    });
    expect(await filaComLimite.contarPendentes()).toBe(0);
  });

  test('registarFalhaEnvio e libertarPresasAEnviar devolvem a pendente', async () => {
    await fila.adicionar(U, 'create_address', {});
    await fila.adicionar(U, 'create_address', {});
    await fila.marcarAEnviar(U, ['op-1']);
    await fila.registarFalhaEnvio(U, 'sem rede');
    expect(await fila.obter('op-1')).toMatchObject({
      estado: 'pendente',
      tentativas: 1,
      ultimo_erro: 'sem rede',
    });

    await fila.marcarAEnviar(U, ['op-2']);
    expect(await fila.libertarPresasAEnviar()).toBe(1);
    expect(await fila.obter('op-2')).toMatchObject({ estado: 'pendente', tentativas: 0 });
  });

  test('limparConcluidasAntigas só apaga concluídas com mais de 7 dias', async () => {
    const ficheiros = criarRepositorioFicheirosPendentes(db, { relogio });
    await fila.adicionar(U, 'create_address', {}); // op-1: concluída antiga
    await fila.adicionar(U, 'create_address', {}); // op-2: pendente antiga
    await ficheiros.registar({
      id: 'foto-1',
      caminho_local: '/docs/foto-1.jpg',
      bucket: 'fotos',
      content_type: 'image/jpeg',
      operation_id: 'op-1',
    });
    await fila.marcarAEnviar(U, ['op-1']);
    await fila.aplicarResultadosSync(U, [{ operation_id: 'op-1', status: 'OK' }]);
    relogio.avancar(8 * 24 * 3_600_000);
    await fila.adicionar(U, 'create_address', {}); // op-3: concluída recente
    await fila.marcarAEnviar(U, ['op-3']);
    await fila.aplicarResultadosSync(U, [{ operation_id: 'op-3', status: 'OK' }]);

    expect(await fila.limparConcluidasAntigas()).toBe(1);
    expect(await fila.obter('op-1')).toBeNull();
    expect(await fila.obter('op-2')).not.toBeNull();
    expect(await fila.obter('op-3')).not.toBeNull();
    // O registo do ficheiro fica, só perde a ligação à operação apagada.
    expect(await ficheiros.obter('foto-1')).toMatchObject({ operation_id: null });
  });
});

describe('ficheiros pendentes', () => {
  test('registar, listar por operação, marcar enviado e contar', async () => {
    const db = await baseMigrada();
    const fila = criarRepositorioFilaSaida(db, {
      deviceId: 'd1',
      gerarId: geradorSequencial('op'),
    });
    const ficheiros = criarRepositorioFicheirosPendentes(db, {
      gerarId: geradorSequencial('foto'),
    });
    const foto = await ficheiros.registar({
      caminho_local: 'file:///docs/fotos/foto-1.jpg',
      bucket: 'fotos',
      content_type: 'image/jpeg',
      sha256: 'abc',
      tamanho_bytes: 1234,
    });
    const op = await fila.adicionar(U, 'create_address', {
      photo_facade_url: marcadorOffline(foto.id),
    });
    await ficheiros.associarOperacao(foto.id, op.operation_id);

    expect(idDoMarcador((op.payload as { photo_facade_url: string }).photo_facade_url)).toBe(
      'foto-1',
    );
    expect(idDoMarcador('https://exemplo/foto.jpg')).toBeNull();
    expect((await ficheiros.listarPorOperacao('op-1')).map((f) => f.id)).toEqual(['foto-1']);
    expect(await ficheiros.contarPendentes()).toBe(1);

    await ficheiros.marcarEnviado('foto-1', 'https://exemplo/foto-1.jpg');

    expect(await ficheiros.obter('foto-1')).toMatchObject({
      estado: 'enviado',
      url_remota: 'https://exemplo/foto-1.jpg',
    });
    expect(await ficheiros.contarPendentes()).toBe(0);
  });
});

describe('transações', () => {
  test('se algo falhar a meio, tudo é desfeito', async () => {
    const db = await baseMigrada();
    const moradas = criarRepositorioMoradas(db);

    await expect(
      moradas.guardarVarias([
        morada('m1', -8.8, 13.2),
        morada('m2', -8.81, 13.21),
        morada('m3', 200, 13.2), // latitude impossível: o CHECK rejeita
      ]),
    ).rejects.toThrow(/CHECK/);

    expect(await db.getAll('SELECT id FROM moradas')).toEqual([]);
  });

  test('um erro lançado pelo código também desfaz a transação', async () => {
    const db = await baseMigrada();
    const fila = criarRepositorioFilaSaida(db, { deviceId: 'd1' });

    await expect(
      db.transacao(async (tx) => {
        await criarRepositorioFilaSaida(tx, {
          deviceId: 'd1',
          gerarId: () => 'op-1',
        }).adicionar(U, 'create_address', {});
        expect(await tx.getFirst('SELECT operation_id FROM fila_saida')).not.toBeNull();
        throw new Error('falhou a meio');
      }),
    ).rejects.toThrow('falhou a meio');

    expect(await fila.contarPendentes()).toBe(0);
  });

  test('uma transação dentro de outra só desfaz a sua parte', async () => {
    const db = await baseMigrada();
    const agora = '2026-09-23T10:00:00.000Z';
    await db.transacao(async (tx) => {
      await tx.run(
        `INSERT INTO entregas (id, estado, atualizado_em) VALUES ('e1', 'nova', ?)`,
        [agora],
      );
      await expect(
        tx.transacao(async (tx2) => {
          await tx2.run(
            `INSERT INTO entregas (id, estado, atualizado_em) VALUES ('e2', 'nova', ?)`,
            [agora],
          );
          throw new Error('só esta parte');
        }),
      ).rejects.toThrow('só esta parte');
    });

    expect(await db.getAll('SELECT id FROM entregas')).toEqual([{ id: 'e1' }]);
  });

  test('operações de fora esperam que a transação acabe', async () => {
    const db = await baseMigrada();
    const agora = '2026-09-23T10:00:00.000Z';
    const ordem: string[] = [];

    const transacao = db.transacao(async (tx) => {
      await tx.run(`INSERT INTO entregas (id, estado, atualizado_em) VALUES ('e1', 'a', ?)`, [
        agora,
      ]);
      await new Promise((r) => setTimeout(r, 10));
      ordem.push('transacao');
      throw new Error('desfaz');
    });
    const leitura = db.getAll('SELECT id FROM entregas').then((linhas) => {
      ordem.push('leitura');
      return linhas;
    });

    await expect(transacao).rejects.toThrow('desfaz');
    expect(await leitura).toEqual([]);
    expect(ordem).toEqual(['transacao', 'leitura']);
  });
});

describe('moradas', () => {
  test('procurarPerto encontra a morada a 10 m e ignora a de 500 m', async () => {
    const db = await baseMigrada();
    const moradas = criarRepositorioMoradas(db);
    const lat = -8.8383;
    const lng = 13.2344;
    const grauLatEmMetros = 111_195; // com o raio médio da Terra
    await moradas.guardarVarias([
      morada('a-10m', lat + 10 / grauLatEmMetros, lng),
      morada('a-500m', lat, lng + 500 / (grauLatEmMetros * Math.cos((lat * Math.PI) / 180))),
    ]);

    const perto = await moradas.procurarPerto(lat, lng, 50);

    expect(perto.map((m) => m.id)).toEqual(['a-10m']);
    expect(perto[0].distancia_m).toBeGreaterThan(9.5);
    expect(perto[0].distancia_m).toBeLessThan(10.5);
    expect(perto[0].dados).toEqual({ rua: 'Rua A' });

    const maisLonge = await moradas.procurarPerto(lat, lng, 600);
    expect(maisLonge.map((m) => m.id)).toEqual(['a-10m', 'a-500m']);
  });

  test('guardarVarias atualiza e as pesquisas por código funcionam', async () => {
    const db = await baseMigrada();
    const moradas = criarRepositorioMoradas(db);
    await moradas.guardarVarias([
      { ...morada('m1', -8.8, 13.2), plus_code: '6fj4mq66+2v', codigo_postal: '1000-01' },
    ]);
    await moradas.guardarVarias([
      { ...morada('m1', -8.8, 13.2), plus_code: '6FJ4MQ66+2V', codigo_postal: '1000-02' },
    ]);

    expect((await moradas.procurarPorPlusCode('6fj4mq66+2v')).map((m) => m.id)).toEqual(['m1']);
    expect(await moradas.procurarPorCodigoPostal('1000-01')).toEqual([]);
    expect((await moradas.procurarPorCodigoPostal('1000-02')).map((m) => m.id)).toEqual(['m1']);
  });
});

describe('chaves do dispositivo', () => {
  test('guarda a chave pública e recusa uma chave privada', async () => {
    const db = await baseMigrada();
    const chaves = criarRepositorioChavesDispositivo(db);
    const publica = { kty: 'EC', crv: 'P-256', x: 'xx', y: 'yy' };

    await chaves.guardar({ device_id: 'd1', chave_publica_jwk: publica });
    await chaves.marcarRegistada('d1');
    expect(await chaves.obter('d1')).toMatchObject({
      chave_publica_jwk: publica,
      registada: true,
    });

    await expect(
      chaves.guardar({ device_id: 'd2', chave_publica_jwk: { ...publica, d: 'segredo' } }),
    ).rejects.toThrow(/secure-store/);
  });

  test('chave no servidor por utilizador: fica mesmo que a chave local mude', async () => {
    const db = await baseMigrada();
    const chaves = criarRepositorioChavesDispositivo(db);
    const antiga = { kty: 'EC', crv: 'P-256', x: 'xa', y: 'ya' };
    const nova = { kty: 'EC', crv: 'P-256', x: 'xn', y: 'yn' };

    await chaves.guardar({ device_id: 'd1', chave_publica_jwk: antiga });
    expect(await chaves.chaveNoServidor('u-ana', 'd1')).toBeNull();
    await chaves.registarNoServidor('u-ana', 'd1', antiga);
    expect(await chaves.chaveNoServidor('u-ana', 'd1')).toEqual(antiga);
    expect(await chaves.chaveNoServidor('u-beto', 'd1')).toBeNull();
    expect((await chaves.obter('d1'))!.registada).toBe(true);

    // Chave local nova: volta a "não registada", mas o servidor ainda tem a antiga.
    await chaves.guardar({ device_id: 'd1', chave_publica_jwk: nova });
    expect((await chaves.obter('d1'))!.registada).toBe(false);
    expect(await chaves.chaveNoServidor('u-ana', 'd1')).toEqual(antiga);

    // Registar outra chave que não é a local não marca a local como registada.
    await chaves.registarNoServidor('u-beto', 'd1', antiga);
    expect((await chaves.obter('d1'))!.registada).toBe(false);
    await chaves.registarNoServidor('u-ana', 'd1', nova);
    expect(await chaves.chaveNoServidor('u-ana', 'd1')).toEqual(nova);
    await chaves.registarNoServidor('u-ana', 'd-anterior', antiga);
    expect(await chaves.chavesNoServidorDoUtilizador('u-ana')).toEqual({ d1: nova, 'd-anterior': antiga });
    expect(await chaves.chavesNoServidorDoUtilizador('u-carla')).toEqual({});
    expect((await chaves.obter('d1'))!.registada).toBe(true);

    await expect(chaves.registarNoServidor('u-ana', 'd1', { ...nova, d: 'segredo' })).rejects.toThrow(
      /secure-store/,
    );
  });
});

describe('migração 003', () => {
  test('corre sobre uma base na versão 2 com dados e mantém a chave local', async () => {
    const { db: antiga } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(antiga, MIGRACOES.slice(0, 2));
    await antiga.run(
      `INSERT INTO chaves_dispositivo (device_id, chave_publica_jwk, registada, criada_em)
       VALUES ('d1', '{"kty":"EC","crv":"P-256","x":"xx","y":"yy"}', 0, '2026-09-01T10:00:00.000Z')`,
    );

    await expect(aplicarMigracoes(antiga)).resolves.toBe(MIGRACOES.length);

    expect((await criarRepositorioChavesDispositivo(antiga).obter('d1'))!.chave_publica_jwk).toEqual({
      kty: 'EC',
      crv: 'P-256',
      x: 'xx',
      y: 'yy',
    });
    await expect(
      antiga.run(
        `INSERT INTO provas_evidencia (operation_id, user_id, device_id, payload_json, motivo, criada_em)
         VALUES ('o', 'u', 'd', 'não é json', 'm', 'x')`,
      ),
    ).rejects.toThrow();
  });
});

describe('provas_evidencia', () => {
  test('guarda a cópia, mantém a primeira data e lista por utilizador', async () => {
    const db = await baseMigrada();
    let agora = new Date('2026-09-23T10:00:00.000Z');
    const evidencias = criarRepositorioProvasEvidencia(db, () => agora);
    await evidencias.guardar({
      operation_id: 'op-1',
      user_id: 'u-ana',
      device_id: 'app-1',
      payload: { proof: { crypto_signature: 'sig' } },
      motivo: 'não confere',
    });
    agora = new Date('2026-09-23T11:00:00.000Z');
    await evidencias.guardar({
      operation_id: 'op-1',
      user_id: 'u-ana',
      device_id: 'app-1',
      payload: { proof: { crypto_signature: 'sig', photo_url: 'https://x' } },
      motivo: 'não confere',
    });
    await evidencias.guardar({ operation_id: 'op-2', user_id: 'u-beto', device_id: 'app-1', payload: {}, motivo: 'm' });

    expect(await evidencias.listarDoUtilizador('u-ana')).toEqual([
      {
        operation_id: 'op-1',
        user_id: 'u-ana',
        device_id: 'app-1',
        payload: { proof: { crypto_signature: 'sig', photo_url: 'https://x' } },
        motivo: 'não confere',
        criada_em: '2026-09-23T10:00:00.000Z',
        visto_em: null,
      },
    ]);
    expect((await evidencias.obter('op-2'))!.user_id).toBe('u-beto');
    expect(await evidencias.obter('op-3')).toBeNull();
  });

  test('"Já vi" esconde o aviso da lista, mas nunca apaga a prova', async () => {
    const db = await baseMigrada();
    let agora = new Date('2026-09-23T10:00:00.000Z');
    const evidencias = criarRepositorioProvasEvidencia(db, () => agora);
    await evidencias.guardar({ operation_id: 'op-1', user_id: 'u-ana', device_id: 'a', payload: {}, motivo: 'm' });
    await evidencias.guardar({ operation_id: 'op-2', user_id: 'u-ana', device_id: 'a', payload: {}, motivo: 'm' });

    // Outro utilizador não consegue marcar.
    expect(await evidencias.marcarVista('u-beto', 'op-1')).toBe(false);
    agora = new Date('2026-09-23T12:00:00.000Z');
    expect(await evidencias.marcarVista('u-ana', 'op-1')).toBe(true);
    expect(await evidencias.marcarVista('u-ana', 'op-1')).toBe(false);

    const naoVistas = await evidencias.listarDoUtilizador('u-ana', { soNaoVistas: true });
    expect(naoVistas.map((e) => e.operation_id)).toEqual(['op-2']);
    expect(await evidencias.listarDoUtilizador('u-ana')).toHaveLength(2);
    expect((await evidencias.obter('op-1'))!.visto_em).toBe('2026-09-23T12:00:00.000Z');

    // Reenviar a mesma prova não volta a mostrar o aviso.
    await evidencias.guardar({ operation_id: 'op-1', user_id: 'u-ana', device_id: 'a', payload: { x: 1 }, motivo: 'm' });
    expect((await evidencias.obter('op-1'))!.visto_em).toBe('2026-09-23T12:00:00.000Z');
  });
});

describe('migração 004', () => {
  test('mantém as provas que já existiam, ainda por ver', async () => {
    const { db: antiga } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(antiga, MIGRACOES.slice(0, 3));
    await antiga.run(
      `INSERT INTO provas_evidencia (operation_id, user_id, device_id, payload_json, motivo, criada_em)
       VALUES ('o', 'u', 'd', '{}', 'm', '2026-09-01T10:00:00.000Z')`,
    );
    await expect(aplicarMigracoes(antiga)).resolves.toBe(MIGRACOES.length);
    const repo = criarRepositorioProvasEvidencia(antiga);
    expect((await repo.obter('o'))!.visto_em).toBeNull();
    expect(await repo.listarDoUtilizador('u', { soNaoVistas: true })).toHaveLength(1);
  });
});

describe('zonas_geocodificadas (migração 005)', () => {
  test('guarda a última resposta de cada zona e substitui a antiga', async () => {
    const db = await baseMigrada();
    let agora = new Date('2026-09-23T10:00:00.000Z');
    const zonas = criarRepositorioZonasGeocodificadas(db, () => agora);
    await zonas.guardar({ zona: '6F4HMP8Q', latitude: -12.776, longitude: 15.739, provincia: 'Huambo', municipio: 'X', resposta: { a: 1 } });
    agora = new Date('2026-09-23T11:00:00.000Z');
    await zonas.guardar({ zona: '6F4HMP8Q', latitude: -12.776, longitude: 15.739, provincia: 'Huambo', municipio: 'Huambo', resposta: null });
    expect(await zonas.obter('6F4HMP8Q')).toEqual({
      zona: '6F4HMP8Q',
      latitude: -12.776,
      longitude: 15.739,
      provincia: 'Huambo',
      municipio: 'Huambo',
      resposta: null,
      atualizado_em: '2026-09-23T11:00:00.000Z',
    });
    expect(await zonas.obter('outra')).toBeNull();
  });

  test('encontra a zona guardada mais perto, só dentro do raio', async () => {
    const db = await baseMigrada();
    const zonas = criarRepositorioZonasGeocodificadas(db);
    await zonas.guardar({ zona: 'A', latitude: -12.776, longitude: 15.739, provincia: 'Huambo', municipio: 'Huambo', resposta: null });
    await zonas.guardar({ zona: 'B', latitude: -12.85, longitude: 15.56, provincia: 'Huambo', municipio: 'Caála', resposta: null });
    expect((await zonas.maisProxima(-12.78, 15.74, 3000))!.zona).toBe('A');
    expect((await zonas.maisProxima(-12.84, 15.57, 3000))!.municipio).toBe('Caála');
    expect(await zonas.maisProxima(-12.5, 15.2, 3000)).toBeNull();
  });

  test('migra uma base na versão 4', async () => {
    const { db: antiga } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(antiga, MIGRACOES.slice(0, 4));
    await expect(aplicarMigracoes(antiga)).resolves.toBe(MIGRACOES.length);
    expect(await criarRepositorioZonasGeocodificadas(antiga).obter('x')).toBeNull();
  });
});

describe('codigos_confirmados (migração 006)', () => {
  test('guarda o último código confirmado de cada célula', async () => {
    const db = await baseMigrada();
    let agora = new Date('2026-09-23T20:00:00.000Z');
    const codigos = criarRepositorioCodigosConfirmados(db, () => agora);
    await codigos.guardar({ chave: 'HUA-MNFQPN2S', codigo: 'AO-HUA-MNFQPN2S-95', latitude: -12.77, longitude: 15.73 });
    agora = new Date('2026-09-23T21:00:00.000Z');
    await codigos.guardar({ chave: 'HUA-MNFQPN2S', codigo: 'AO-HUA-MNFQPN2S-3-95', latitude: -12.77, longitude: 15.73 });
    expect(await codigos.obter('HUA-MNFQPN2S')).toEqual({
      chave: 'HUA-MNFQPN2S',
      codigo: 'AO-HUA-MNFQPN2S-3-95',
      latitude: -12.77,
      longitude: 15.73,
      confirmado_em: '2026-09-23T21:00:00.000Z',
    });
    expect(await codigos.obter('outra')).toBeNull();
  });

  test('migra uma base na versão 5', async () => {
    const { db: antiga } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(antiga, MIGRACOES.slice(0, 5));
    await expect(aplicarMigracoes(antiga, MIGRACOES.slice(0, 6))).resolves.toBe(6);
    expect(await criarRepositorioCodigosConfirmados(antiga).obter('x')).toBeNull();
  });
});

describe('favoritos do utilizador (migração 007)', () => {
  test('uma base na versão 6 migra; os favoritos antigos (sem dono) não aparecem a ninguém', async () => {
    const { db: antiga } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(antiga, MIGRACOES.slice(0, 6));
    await antiga.run(
      `INSERT INTO favoritos (id, morada_id, nome, categoria, atualizado_em)
       VALUES ('fav-velho', 'm1', 'Casa', 'casa', '2026-09-01T10:00:00.000Z')`,
    );
    await expect(aplicarMigracoes(antiga)).resolves.toBe(7);
    const favoritos = criarRepositorioFavoritos(antiga);
    expect(await favoritos.obter('fav-velho')).toMatchObject({ user_id: null, pendente: null, criado_em: null });
    expect(await favoritos.listarDoUtilizador('user-1')).toEqual([]);
  });

  test('pendente só aceita "atualizar" ou "remover"', async () => {
    const db = await baseMigrada();
    await expect(
      db.run(
        `INSERT INTO favoritos (id, morada_id, nome, categoria, pendente, atualizado_em)
         VALUES ('f1', 'm1', 'Casa', 'casa', 'talvez', '2026-09-01T10:00:00.000Z')`,
      ),
    ).rejects.toThrow(/CHECK/);
  });
});

describe('fila por utilizador (migração 002)', () => {
  let db: BaseDados;
  let fila: ReturnType<typeof criarRepositorioFilaSaida>;

  beforeEach(async () => {
    db = await baseMigrada();
    fila = criarRepositorioFilaSaida(db, {
      deviceId: 'telemovel-1',
      gerarId: geradorSequencial('op'),
      relogio: relogioManual(),
    });
  });

  test('a operação do utilizador A nunca aparece para o B', async () => {
    const a = await fila.adicionar('utilizador-a', 'create_address', { de: 'A' });
    await fila.adicionar('utilizador-b', 'create_address', { de: 'B' });
    expect(a.user_id).toBe('utilizador-a');

    expect((await fila.listarProntas('utilizador-a')).map((o) => o.payload)).toEqual([{ de: 'A' }]);
    expect((await fila.listarProntas('utilizador-b')).map((o) => o.payload)).toEqual([{ de: 'B' }]);
    expect(await fila.listarProntas('utilizador-c')).toEqual([]);

    // B não consegue marcar nem mexer na operação de A.
    await fila.marcarAEnviar('utilizador-b', ['op-1']);
    expect(await fila.obter('op-1')).toMatchObject({ estado: 'pendente' });

    await fila.marcarAEnviar('utilizador-a', ['op-1']);
    await fila.marcarAEnviar('utilizador-b', ['op-2']);
    // A resposta do envio de B (sem a op-1) não conta como falha para A.
    await fila.aplicarResultadosSync('utilizador-b', [{ operation_id: 'op-2', status: 'OK' }]);
    expect(await fila.obter('op-1')).toMatchObject({ estado: 'a_enviar', tentativas: 0 });
    await fila.registarFalhaEnvio('utilizador-b', 'sem rede');
    expect(await fila.obter('op-1')).toMatchObject({ estado: 'a_enviar', tentativas: 0 });
    await fila.registarFalhaEnvio('utilizador-a', 'sem rede');
    expect(await fila.obter('op-1')).toMatchObject({ estado: 'pendente', tentativas: 1 });
  });

  test('adicionar e listarProntas exigem user_id', async () => {
    await expect(fila.adicionar('', 'create_address', {})).rejects.toThrow(/user_id/);
    await expect(fila.adicionar('   ', 'create_address', {})).rejects.toThrow(/user_id/);
    await expect(
      fila.adicionar(undefined as unknown as string, 'create_address', {}),
    ).rejects.toThrow(/user_id/);
    await expect(fila.listarProntas('')).rejects.toThrow(/user_id/);
    expect(await fila.contarPendentes()).toBe(0);
  });

  test('contarPendentesDoUtilizador só conta as do utilizador e não enviadas', async () => {
    await fila.adicionar('utilizador-a', 'create_address', {}); // op-1
    await fila.adicionar('utilizador-a', 'field_submit', {}); // op-2
    await fila.adicionar('utilizador-b', 'create_address', {}); // op-3
    await fila.marcarAEnviar('utilizador-a', ['op-1', 'op-2']);
    await fila.aplicarResultadosSync('utilizador-a', [{ operation_id: 'op-1', status: 'OK' }]);

    expect(await fila.contarPendentesDoUtilizador('utilizador-a')).toBe(1);
    expect(await fila.contarPendentesDoUtilizador('utilizador-b')).toBe(1);
    expect(await fila.contarPendentesDoUtilizador('utilizador-c')).toBe(0);
    expect(await fila.contarPendentes()).toBe(2);
  });

  test('a migração 002 corre sobre uma base que já tinha a 001 com dados', async () => {
    const { db: antiga } = await criarBaseDadosSqlJs();
    await aplicarMigracoes(antiga, [MIGRACOES[0]]);
    expect(await lerVersao(antiga)).toBe(1);
    await antiga.run(
      `INSERT INTO fila_saida (operation_id, device_id, operation_type, payload_json,
         estado, tentativas, criado_em, atualizado_em)
       VALUES ('antiga-1', 'telemovel-1', 'create_address', '{"n":1}', 'pendente', 0,
         '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z')`,
    );
    await antiga.run(
      `INSERT INTO favoritos (id, morada_id, nome, atualizado_em)
       VALUES ('fav-1', 'm1', 'Casa', '2026-09-01T10:00:00.000Z')`,
    );

    await expect(aplicarMigracoes(antiga, MIGRACOES.slice(0, 2))).resolves.toBe(2);

    const filaAntiga = criarRepositorioFilaSaida(antiga, { deviceId: 'telemovel-1' });
    // Os dados que já existiam continuam lá.
    expect(await filaAntiga.obter('antiga-1')).toMatchObject({
      user_id: null,
      estado: 'pendente',
      payload: { n: 1 },
    });
    expect(await antiga.getAll('SELECT id FROM favoritos')).toEqual([{ id: 'fav-1' }]);
    // Sem dono: conta como pendente, mas não é enviada automaticamente a ninguém.
    expect(await filaAntiga.contarPendentes()).toBe(1);
    expect(await filaAntiga.listarProntas('utilizador-a')).toEqual([]);
    await filaAntiga.marcarAEnviar('utilizador-a', ['antiga-1']);
    expect(await filaAntiga.obter('antiga-1')).toMatchObject({ estado: 'pendente' });
    // A tabela nova existe e funciona.
    expect(await nomesTabelas(antiga)).toContain('perfil_local');
  });
});

describe('fila: listarPorEnviarDoTipo', () => {
  test('inclui pendentes (mesmo na pausa) e a_enviar do tipo e do utilizador', async () => {
    const db = await baseMigrada();
    let n = 0;
    const fila = criarRepositorioFilaSaida(db, { deviceId: 'app-1', gerarId: () => `op-${++n}` });
    const a = await fila.adicionar('u-ana', 'delivery_proof', { n: 1 });
    const b = await fila.adicionar('u-ana', 'delivery_proof', { n: 2 });
    await fila.adicionar('u-ana', 'create_address', { n: 3 });
    await fila.adicionar('u-beto', 'delivery_proof', { n: 4 });
    const c = await fila.adicionar('u-ana', 'delivery_proof', { n: 5 });
    await fila.registarFalhaOperacao('u-ana', a.operation_id, 'erro'); // em pausa
    await fila.marcarAEnviar('u-ana', [b.operation_id]);
    await fila.marcarFalhouDefinitivo('u-ana', c.operation_id, 'foto');

    expect(
      (await fila.listarPorEnviarDoTipo('u-ana', 'delivery_proof')).map((o) => o.operation_id),
    ).toEqual([a.operation_id, b.operation_id]);
  });
});

describe('perfil_local', () => {
  test('guarda, substitui e lê o último perfil confirmado', async () => {
    const db = await baseMigrada();
    const relogio = relogioManual();
    const perfis = criarRepositorioPerfilLocal(db, relogio);

    expect(await perfis.obter('utilizador-a')).toBeNull();
    await perfis.guardar({
      user_id: 'utilizador-a',
      email: 'a@exemplo.ao',
      cargos: ['estafeta'],
      estado_kyc: 'PENDING_ID',
    });
    relogio.avancar(60_000);
    await perfis.guardar({
      user_id: 'utilizador-a',
      email: 'a@exemplo.ao',
      cargos: ['estafeta', 'tecnico_campo'],
      estado_kyc: 'ID_VERIFIED',
    });

    expect(await perfis.obter('utilizador-a')).toEqual({
      user_id: 'utilizador-a',
      email: 'a@exemplo.ao',
      cargos: ['estafeta', 'tecnico_campo'],
      estado_kyc: 'ID_VERIFIED',
      confirmado_em: '2026-09-23T10:01:00.000Z',
    });
    expect(await perfis.obter('utilizador-b')).toBeNull();
  });

  test('cargos_json tem de ser uma lista JSON', async () => {
    const db = await baseMigrada();
    await expect(
      db.run(
        `INSERT INTO perfil_local (user_id, cargos_json, confirmado_em) VALUES ('u', '{}', 'x')`,
      ),
    ).rejects.toThrow(/CHECK/);
  });
});
