/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, test } from '@jest/globals';
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { randomBytes, webcrypto } from 'crypto';

import { aplicarMigracoes } from '@/database/migrations';
import { criarRepositorioChavesDispositivo } from '@/database/repositories/chavesDispositivo';
import { criarBaseDadosSqlJs } from '@/database/testes/baseDadosSqlJs';
import type { BaseDados } from '@/database/tipos';

import { garantirGetRandomValues } from '../aleatorio';
import {
  ALGORITMO_ASSINATURA,
  construirMensagem,
  criarAssinarProva,
  paraCamposProva,
  verificarAssinatura,
  type DadosProva,
} from '../assinarProva';
import { deBase64, deBase64Url, paraBase64, paraBase64Url } from '../base64';
import {
  criarChaveDispositivo,
  NOME_CHAVE_ASSINATURA,
  type CorpoRegisto,
  type DependenciasChave,
} from '../chaveDispositivo';
import { chavePublicaParaJwk, jwkParaChavePublica } from '../jwk';

const subtle = webcrypto.subtle;
const DEVICE = 'app-3b0c1d2e-0000-4000-8000-000000000001';
const ANA = { userId: 'u-ana', accessToken: 'token-ana' };
const BETO = { userId: 'u-beto', accessToken: 'token-beto' };
const AGORA = new Date('2026-09-23T10:15:00.000Z');

const DADOS: DadosProva = {
  delivery_id: '7f1c2a9e-1111-4222-8333-944455556666',
  lat: -8.838333,
  lng: 13.234444,
  plus_code: '6CVJ5QP7+M9',
  foto_sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  assinatura_manuscrita_sha256: null,
};

/** Verificação feita EXATAMENTE como a Edge Function "deliveries" (v17) faz. */
async function verificarComoOServidor(
  jwk: unknown,
  cryptoPayload: string,
  cryptoSignature: string,
): Promise<boolean> {
  const publicKey = await subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const sigBytes = Uint8Array.from(atob(cryptoSignature), (c) => c.charCodeAt(0));
  const dataBytes = new TextEncoder().encode(cryptoPayload);
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, sigBytes, dataBytes);
}

function cofreFalso() {
  const itens = new Map<string, string>();
  let falharLeitura = false;
  return {
    itens,
    falharLeitura(sim: boolean) {
      falharLeitura = sim;
    },
    cofre: {
      getItemAsync: async (nome: string) => {
        if (falharLeitura) throw new Error('errSecInteractionNotAllowed');
        return itens.get(nome) ?? null;
      },
      setItemAsync: async (nome: string, valor: string) => {
        itens.set(nome, valor);
      },
      deleteItemAsync: async (nome: string) => {
        itens.delete(nome);
      },
    },
  };
}

let db: BaseDados;
let cofre: ReturnType<typeof cofreFalso>;
let registos: { token: string; corpo: CorpoRegisto }[];
let online: boolean;
let respostaRegisto: 'ok' | 'sessao' | string;
let preparacoes: number;
/** Chaves com provas "por enviar" na fila falsa (JSON das JWK). */
let provasPorEnviarCom: Set<string>;

beforeEach(async () => {
  ({ db } = await criarBaseDadosSqlJs());
  await aplicarMigracoes(db);
  cofre = cofreFalso();
  registos = [];
  online = true;
  respostaRegisto = 'ok';
  preparacoes = 0;
  provasPorEnviarCom = new Set();
});

function montar(extra: Partial<DependenciasChave> = {}) {
  const chaves = criarRepositorioChavesDispositivo(db, () => AGORA);
  const chave = criarChaveDispositivo({
    cofre: cofre.cofre,
    chaves,
    obterIdDispositivo: async () => DEVICE,
    prepararAleatorio: () => {
      preparacoes++;
    },
    erroDeLeituraEPerda: false,
    obterSessao: async () => ANA,
    estaOnline: async () => online,
    pedirRegisto: async (token, corpo) => {
      registos.push({ token, corpo });
      return respostaRegisto;
    },
    haProvasPorEnviarAssinadasCom: async (_u, _d, jwk) => provasPorEnviarCom.has(JSON.stringify(jwk)),
    ...extra,
  });
  const assinarProva = criarAssinarProva(chave, () => AGORA);
  return { chave, chaves, assinarProva };
}

/** Tudo o que está gravado no SQLite, como texto. */
async function tudoNoSqlite(): Promise<string> {
  const tabelas = await db.getAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  const linhas = [];
  for (const { name } of tabelas) linhas.push(await db.getAll(`SELECT * FROM "${name}"`));
  return JSON.stringify(linhas);
}

function chavePrivadaGuardada(): Uint8Array {
  const valor = cofre.itens.get(NOME_CHAVE_ASSINATURA)!;
  return Uint8Array.from(Buffer.from(valor.split(':')[2], 'hex'));
}

describe('compatibilidade com o Web Crypto (o que o site e o servidor usam)', () => {
  test('uma prova assinada pela app é aceite pela verificação do servidor', async () => {
    const { chave, assinarProva } = montar();
    const prova = await assinarProva(DADOS);
    // A JWK passa por JSON, como no SQLite e no pedido ao servidor.
    const { jwk } = await chave.chavePublica();
    const jwkNoServidor = JSON.parse(JSON.stringify(jwk));

    expect(prova.algoritmo).toBe('ECDSA-SHA256');
    expect(prova.device_id).toBe(DEVICE);
    expect(deBase64(prova.assinatura)).toHaveLength(64);
    expect(prova.assinatura).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64 normal, não base64url
    expect(await verificarComoOServidor(jwkNoServidor, prova.payload_assinado, prova.assinatura)).toBe(true);
  });

  test('várias mensagens diferentes (incluindo acentos) são todas aceites', async () => {
    const { chave, assinarProva } = montar();
    const { jwk } = await chave.chavePublica();
    for (let i = 0; i < 20; i++) {
      const prova = await assinarProva({ ...DADOS, plus_code: `Luanda—São Paulo ${i}`, lat: -8 - i / 100 });
      expect(await verificarComoOServidor(jwk, prova.payload_assinado, prova.assinatura)).toBe(true);
    }
  });

  test('uma assinatura criada pelo Web Crypto é aceite pela verificação do @noble', async () => {
    const par = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await subtle.exportKey('jwk', par.publicKey);
    // Várias vezes: o Web Crypto produz metade das vezes um S "alto", que também tem de passar.
    for (let i = 0; i < 20; i++) {
      const mensagem = JSON.stringify({ delivery_id: `d${i}`, lat: -8.8, lng: 13.2, timestamp: AGORA.toISOString() });
      const assinatura = new Uint8Array(
        await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, new TextEncoder().encode(mensagem)),
      );
      expect(assinatura).toHaveLength(64);
      expect(verificarAssinatura(mensagem, paraBase64(assinatura), jwk)).toBe(true);
      expect(verificarAssinatura(`${mensagem} `, paraBase64(assinatura), jwk)).toBe(false);
    }
  });

  test('a mensagem alterada num só caractere falha na verificação', async () => {
    const { chave, assinarProva } = montar();
    const prova = await assinarProva(DADOS);
    const { jwk } = await chave.chavePublica();
    const alterada = prova.payload_assinado.replace('"lat":-8.838333', '"lat":-8.838334');
    expect(alterada).not.toBe(prova.payload_assinado);
    expect(alterada).toHaveLength(prova.payload_assinado.length);

    expect(await verificarComoOServidor(jwk, alterada, prova.assinatura)).toBe(false);
    expect(verificarAssinatura(alterada, prova.assinatura, jwk)).toBe(false);
    expect(verificarAssinatura(prova.payload_assinado, prova.assinatura, jwk)).toBe(true);
  });

  test('outra chave não verifica a assinatura', async () => {
    const { assinarProva } = montar();
    const prova = await assinarProva(DADOS);
    const outra = chavePublicaParaJwk(p256.keygen().publicKey);
    expect(await verificarComoOServidor(outra, prova.payload_assinado, prova.assinatura)).toBe(false);
    expect(verificarAssinatura(prova.payload_assinado, prova.assinatura, outra)).toBe(false);
  });
});

describe('JWK', () => {
  test('tem x e y com 32 bytes e não tem o campo "d"', async () => {
    const { chave } = montar();
    const { jwk } = await chave.chavePublica();
    expect(Object.keys(jwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(jwk).not.toHaveProperty('d');
    expect(deBase64Url(jwk.x)).toHaveLength(32);
    expect(deBase64Url(jwk.y)).toHaveLength(32);
    expect(jwk.x).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(jwk.y).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('ida e volta com o @noble e com o Web Crypto', async () => {
    const { secretKey, publicKey } = p256.keygen();
    const jwk = chavePublicaParaJwk(publicKey);
    expect(jwkParaChavePublica(jwk)).toEqual(p256.getPublicKey(secretKey, false));
    // A mesma chave vista pelo Web Crypto dá a mesma JWK.
    const importada = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    expect(await subtle.exportKey('jwk', importada)).toMatchObject(jwk);
    // Chave comprimida (33 bytes) dá a mesma JWK.
    expect(chavePublicaParaJwk(p256.getPublicKey(secretKey, true))).toEqual(jwk);
  });

  test('coordenadas com zeros à esquerda continuam com 32 bytes', () => {
    // Procura uma chave com x a começar em 0x00 (1 em 256): o base64url tem de manter os 32 bytes.
    for (let i = 0; i < 5000; i++) {
      const { publicKey } = p256.keygen();
      const bytes = p256.Point.fromBytes(publicKey).toBytes(false);
      if (bytes[1] !== 0) continue;
      const jwk = chavePublicaParaJwk(publicKey);
      expect(deBase64Url(jwk.x)).toHaveLength(32);
      expect(deBase64Url(jwk.x)[0]).toBe(0);
      return;
    }
    throw new Error('não encontrou uma chave com zero à esquerda');
  });

  test('recusa JWK inválidas', () => {
    const boa = chavePublicaParaJwk(p256.keygen().publicKey);
    expect(() => jwkParaChavePublica({ ...boa, crv: 'P-384' })).toThrow();
    expect(() => jwkParaChavePublica({ ...boa, x: boa.x.slice(1) })).toThrow();
    expect(() => jwkParaChavePublica({ ...boa, y: boa.x })).toThrow(); // ponto fora da curva
    expect(() => jwkParaChavePublica(null)).toThrow();
  });

  test('base64 e base64url batem com o Buffer do Node', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = new Uint8Array(randomBytes(n));
      expect(paraBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
      expect(paraBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
      expect(deBase64(paraBase64(bytes))).toEqual(bytes);
      expect(deBase64Url(paraBase64Url(bytes))).toEqual(bytes);
    }
    expect(() => deBase64('ab$c')).toThrow();
  });
});

describe('chave do aparelho', () => {
  test('é gerada uma só vez e a pública fica no SQLite, não registada', async () => {
    const { chave, chaves } = montar();
    const [a, b] = await Promise.all([chave.chavePublica(), chave.chavePublica()]);
    expect(a).toEqual(b);
    expect(preparacoes).toBe(1); // getRandomValues preparado antes de gerar
    expect(await chaves.obter(DEVICE)).toMatchObject({ chave_publica_jwk: a.jwk, registada: false });
    expect(await chaves.chaveNoServidor('u-ana', DEVICE)).toBeNull();

    // Uma nova instância (a app reabriu) usa a mesma chave.
    const outra = montar();
    expect(await outra.chave.chavePublica()).toEqual(a);
    expect(preparacoes).toBe(1);
  });

  test('a chave privada nunca é gravada no SQLite', async () => {
    const { chave, assinarProva } = montar();
    await assinarProva(DADOS);
    await chave.garantirChaveRegistada();
    const privada = chavePrivadaGuardada();
    expect(p256.utils.isValidSecretKey(privada)).toBe(true);

    const sqlite = await tudoNoSqlite();
    expect(sqlite).toContain((await chave.chavePublica()).jwk.x); // a pública está lá
    for (const forma of [
      bytesToHex(privada),
      bytesToHex(privada).toUpperCase(),
      paraBase64(privada),
      paraBase64Url(privada),
    ]) {
      expect(sqlite).not.toContain(forma);
    }
    expect(sqlite).not.toMatch(/"d"\s*:/);
    // E o que foi enviado ao servidor também não tem a privada.
    expect(JSON.stringify(registos)).not.toContain(paraBase64Url(privada));
    expect(registos[0].corpo.public_key_jwk).not.toHaveProperty('d');
  });

  test('a chave privada desaparecida (backup restaurado) gera uma chave nova, não registada', async () => {
    const primeira = montar();
    const antiga = await primeira.chave.chavePublica();
    await primeira.chave.garantirChaveRegistada();
    expect((await primeira.chaves.obter(DEVICE))!.registada).toBe(true);
    expect(await primeira.chaves.chaveNoServidor('u-ana', DEVICE)).toEqual(antiga.jwk);

    // Backup restaurado: o SQLite e o device_id vêm, a chave privada (THIS_DEVICE_ONLY) não.
    cofre.itens.clear();
    const depois = montar();
    const nova = await depois.chave.chavePublica();

    expect(nova.deviceId).toBe(DEVICE);
    expect(nova.jwk).not.toEqual(antiga.jwk);
    expect(await depois.chaves.obter(DEVICE)).toMatchObject({ chave_publica_jwk: nova.jwk, registada: false });
    // A app continua a saber que o servidor tem a chave antiga.
    expect(await depois.chave.estado('u-ana')).toEqual({
      deviceId: DEVICE,
      local: nova.jwk,
      noServidor: { [DEVICE]: antiga.jwk },
    });

    // A próxima vez com rede regista a chave nova.
    expect(await depois.chave.garantirChaveRegistada()).toMatchObject({ tipo: 'ok', jwk: nova.jwk });
    expect(registos.map((r) => r.corpo.public_key_jwk)).toEqual([antiga.jwk, nova.jwk]);
  });

  test('uma chave guardada no cofre com outro device_id não é usada', async () => {
    const { chave } = montar();
    const antiga = await chave.chavePublica();
    const valor = cofre.itens.get(NOME_CHAVE_ASSINATURA)!;
    cofre.itens.set(NOME_CHAVE_ASSINATURA, valor.replace(DEVICE, 'app-outro'));
    expect((await montar().chave.chavePublica()).jwk).not.toEqual(antiga.jwk);
  });

  test('iPhone ainda bloqueado: não gera outra chave, só dá erro', async () => {
    const { chave } = montar();
    const antes = await chave.chavePublica();
    cofre.falharLeitura(true);

    const bloqueado = montar();
    await expect(bloqueado.chave.chavePublica()).rejects.toThrow(/errSecInteractionNotAllowed/);
    await expect(bloqueado.assinarProva(DADOS)).rejects.toThrow();
    expect(await bloqueado.chave.garantirChaveRegistada()).toMatchObject({ tipo: 'falhou' });

    cofre.falharLeitura(false);
    expect(await bloqueado.chave.chavePublica()).toEqual(antes);
  });

  test('Android com a chave do Keystore perdida: gera uma chave nova', async () => {
    const antes = await montar().chave.chavePublica();
    cofre.falharLeitura(true);
    const cofreQueRecupera = {
      ...cofre.cofre,
      setItemAsync: async (nome: string, valor: string) => {
        cofre.falharLeitura(false);
        await cofre.cofre.setItemAsync(nome, valor);
      },
    };
    const android = montar({ erroDeLeituraEPerda: true, cofre: cofreQueRecupera });
    const nova = await android.chave.chavePublica();
    expect(nova.jwk).not.toEqual(antes.jwk);
    expect((await android.chaves.obter(DEVICE))!.registada).toBe(false);
  });
});

describe('assinarProva', () => {
  test('mensagem versão 2 com os campos por ordem fixa', async () => {
    const { assinarProva } = montar();
    const prova = await assinarProva(DADOS);
    expect(prova.payload_assinado).toBe(
      '{"versao":2,"delivery_id":"7f1c2a9e-1111-4222-8333-944455556666","lat":-8.838333,' +
        '"lng":13.234444,"timestamp":"2026-09-23T10:15:00.000Z","plus_code":"6CVJ5QP7+M9",' +
        '"foto_sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",' +
        '"assinatura_manuscrita_sha256":null}',
    );
    // O servidor só lê delivery_id do texto (tem de ser o da entrega).
    expect(JSON.parse(prova.payload_assinado).delivery_id).toBe(DADOS.delivery_id);
  });

  test('funciona sem rede (só o registo precisa de rede)', async () => {
    online = false;
    const { chave, assinarProva } = montar({
      estaOnline: async () => {
        throw new Error('assinar não deve perguntar pela rede');
      },
    });
    const prova = await assinarProva(DADOS);
    expect(await verificarComoOServidor((await chave.chavePublica()).jwk, prova.payload_assinado, prova.assinatura)).toBe(true);
    expect(registos).toEqual([]);
  });

  test('paraCamposProva usa os nomes que a Edge Function lê', async () => {
    const prova = await montar().assinarProva(DADOS);
    expect(paraCamposProva(prova)).toEqual({
      crypto_payload: prova.payload_assinado,
      crypto_signature: prova.assinatura,
      crypto_algorithm: ALGORITMO_ASSINATURA,
      crypto_device_id: DEVICE,
    });
  });

  test('recusa dados inválidos', () => {
    const ts = AGORA.toISOString();
    expect(() => construirMensagem({ ...DADOS, delivery_id: ' ' }, ts)).toThrow(/delivery_id/);
    expect(() => construirMensagem({ ...DADOS, lat: Number.NaN }, ts)).toThrow(/lat/);
    expect(() => construirMensagem({ ...DADOS, lng: 200 }, ts)).toThrow(/lng/);
    expect(() => construirMensagem({ ...DADOS, plus_code: '' }, ts)).toThrow(/plus_code/);
    expect(() => construirMensagem({ ...DADOS, foto_sha256: 'abc' }, ts)).toThrow(/foto_sha256/);
    // Hash em maiúsculas é normalizado.
    expect(construirMensagem({ ...DADOS, foto_sha256: DADOS.foto_sha256!.toUpperCase() }, ts)).toBe(
      construirMensagem(DADOS, ts),
    );
  });
});

describe('garantirChaveRegistada', () => {
  test('sem rede não regista e a chave continua não registada', async () => {
    online = false;
    const { chave, chaves } = montar();
    expect(await chave.garantirChaveRegistada()).toMatchObject({ tipo: 'falhou' });
    expect(registos).toEqual([]);
    expect((await chaves.obter(DEVICE))!.registada).toBe(false);
  });

  test('sem sessão não regista', async () => {
    const { chave } = montar({ obterSessao: async () => null });
    expect(await chave.garantirChaveRegistada()).toMatchObject({ tipo: 'falhou' });
    expect(registos).toEqual([]);
  });

  test('com rede e sessão regista uma vez e marca registada = 1', async () => {
    const { chave, chaves } = montar();
    const { jwk } = await chave.chavePublica();

    expect(await chave.garantirChaveRegistada()).toEqual({ tipo: 'ok', deviceId: DEVICE, jwk });
    expect(registos).toEqual([{ token: 'token-ana', corpo: { device_id: DEVICE, public_key_jwk: jwk } }]);
    expect((await chaves.obter(DEVICE))!.registada).toBe(true);
    expect(await chaves.chaveNoServidor('u-ana', DEVICE)).toEqual(jwk);
    const linha = await db.getFirst<{ registada: number }>('SELECT registada FROM chaves_dispositivo');
    expect(linha!.registada).toBe(1);

    // Já registada: não volta à rede (funciona até sem rede).
    online = false;
    expect(await chave.garantirChaveRegistada()).toMatchObject({ tipo: 'ok' });
    expect(registos).toHaveLength(1);
  });

  test('outro utilizador no mesmo telemóvel regista a chave para si', async () => {
    const { chave, chaves } = montar();
    await chave.garantirChaveRegistada(ANA);
    await chave.garantirChaveRegistada(BETO);
    expect(registos.map((r) => r.token)).toEqual(['token-ana', 'token-beto']);
    expect(await chaves.chaveNoServidor('u-beto', DEVICE)).toEqual((await chave.chavePublica()).jwk);

    // Já registada para os dois: não volta à rede.
    await chave.garantirChaveRegistada(ANA);
    await chave.garantirChaveRegistada(BETO);
    expect(registos).toHaveLength(2);
  });

  test('chave local nova: espera enquanto houver provas da chave antiga por enviar, depois regista', async () => {
    const primeira = montar();
    const antiga = await primeira.chave.chavePublica();
    await primeira.chave.garantirChaveRegistada();
    cofre.itens.clear(); // a chave privada perdeu-se
    const depois = montar();
    const nova = await depois.chave.chavePublica();

    provasPorEnviarCom.add(JSON.stringify(antiga.jwk));
    expect(await depois.chave.garantirChaveRegistada()).toMatchObject({ tipo: 'espera' });
    expect(registos).toHaveLength(1); // não substituiu a chave do servidor
    expect(await depois.chaves.chaveNoServidor('u-ana', DEVICE)).toEqual(antiga.jwk);

    // As provas antigas foram enviadas: agora regista a nova.
    provasPorEnviarCom.clear();
    expect(await depois.chave.garantirChaveRegistada()).toMatchObject({ tipo: 'ok', jwk: nova.jwk });
    expect(registos.map((r) => r.corpo.public_key_jwk)).toEqual([antiga.jwk, nova.jwk]);
    expect(await depois.chaves.chaveNoServidor('u-ana', DEVICE)).toEqual(nova.jwk);
    expect((await depois.chaves.obter(DEVICE))!.registada).toBe(true);
  });

  test('401 devolve "sessao"; outro erro devolve "falhou"; nenhum marca registada', async () => {
    const { chave, chaves } = montar();
    respostaRegisto = 'sessao';
    expect(await chave.garantirChaveRegistada()).toEqual({ tipo: 'sessao' });
    respostaRegisto = 'signing-keys respondeu 500';
    expect(await chave.garantirChaveRegistada()).toEqual({ tipo: 'falhou', erro: 'signing-keys respondeu 500' });
    expect((await chaves.obter(DEVICE))!.registada).toBe(false);
    expect(await chaves.chaveNoServidor('u-ana', DEVICE)).toBeNull();
  });
});

describe('crypto.getRandomValues no Hermes', () => {
  test('liga o getRandomValues quando não existe e não troca o que já existe', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
      let chamadas = 0;
      const doExpo = (m: Uint8Array): Uint8Array => {
        chamadas++;
        return webcrypto.getRandomValues(m as Uint8Array<ArrayBuffer>);
      };
      garantirGetRandomValues(doExpo);
      expect(globalThis.crypto.getRandomValues).toBe(doExpo);

      // O @noble passa a gerar chaves com ele.
      const { secretKey } = p256.keygen();
      expect(p256.utils.isValidSecretKey(secretKey)).toBe(true);
      expect(chamadas).toBeGreaterThan(0);

      garantirGetRandomValues(() => {
        throw new Error('não devia trocar');
      });
      expect(globalThis.crypto.getRandomValues).toBe(doExpo);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
