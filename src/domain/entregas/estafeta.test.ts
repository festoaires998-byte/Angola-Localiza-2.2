import { describe, expect, test } from '@jest/globals';
import { p256 } from '@noble/curves/nist.js';

import { diferencaNaMensagem, validarFicheirosProva } from '../../../supabase/functions/deliveries/regras';
import { criarAssinarProva, paraCamposProva, verificarAssinatura } from '@/services/crypto/assinarProva';
import { chavePublicaParaJwk } from '@/services/crypto/jwk';

import { assinaturaValida, caminhoSvg, comprimento } from './assinaturaDedo';
import {
  estadoEfetivo,
  faltaNaPod,
  mensagemErroEstafeta,
  MOTIVOS_FALHA,
  payloadFalha,
  payloadPasso,
  payloadPod,
  podeFechar,
  proximoPasso,
  type DadosPod,
} from './estafeta';

const ENTREGA = 'cccccccc-0000-4000-8000-000000000001';
const ESTAFETA = 'aaaaaaaa-0000-4000-8000-000000000002';
const SHA_FOTO = 'a'.repeat(64);
const SHA_ASSINATURA = 'b'.repeat(64);
const pod: DadosPod = {
  pin: ' 4821 ',
  foto: { marcador: 'offline:f1', sha256: SHA_FOTO, uri: 'file:///f1.jpg' },
  assinatura: { marcador: 'offline:a1', sha256: SHA_ASSINATURA, uri: 'file:///a1.png' },
  local: { latitude: -12.7761, longitude: 15.7392, plusCode: '6GXV+2C' },
  observacao: '  Deixei com a vizinha ',
  volumoso: true,
  esperaLonga: false,
};

describe('estafeta: etapas', () => {
  test('recolha (com foto) → a caminho → na zona; depois só a prova ou a falha', () => {
    expect(proximoPasso('ASSIGNED')).toEqual({ novo: 'PICKED_UP', titulo: 'Recolhi a encomenda', precisaFoto: true });
    expect(proximoPasso('PICKED_UP')?.novo).toBe('IN_TRANSIT');
    expect(proximoPasso('IN_TRANSIT')?.novo).toBe('OUT_FOR_DELIVERY');
    expect(proximoPasso('OUT_FOR_DELIVERY')).toBeNull();
    expect(podeFechar('OUT_FOR_DELIVERY')).toBe(true);
    expect(podeFechar('IN_TRANSIT')).toBe(false);
  });

  test('os motivos de falha são os que o servidor aceita', () => {
    expect(MOTIVOS_FALHA.map((m) => m.valor).sort()).toEqual(
      ['codigo_incorreto', 'destinatario_ausente', 'morada_nao_encontrada', 'outro', 'recusa'].sort(),
    );
  });

  test('estado a mostrar: o da última ação à espera de rede; as recusadas não contam', () => {
    expect(estadoEfetivo('ASSIGNED', [])).toBe('ASSIGNED');
    expect(
      estadoEfetivo('ASSIGNED', [
        { deliveryId: ENTREGA, novo: 'PICKED_UP', erro: null },
        { deliveryId: ENTREGA, novo: 'IN_TRANSIT', erro: null },
      ]),
    ).toBe('IN_TRANSIT');
    expect(estadoEfetivo('OUT_FOR_DELIVERY', [{ deliveryId: ENTREGA, novo: 'DELIVERED', erro: 'PIN de confirmacao incorreto' }])).toBe(
      'OUT_FOR_DELIVERY',
    );
  });
});

describe('estafeta: prova de entrega (decisão C)', () => {
  test('PIN, foto, assinatura desenhada e GPS são obrigatórios', () => {
    expect(faltaNaPod(pod)).toEqual([]);
    expect(faltaNaPod({ ...pod, pin: '12', foto: null, assinatura: null, local: null })).toEqual([
      'Esperar pela posição do GPS.',
      'Tirar a foto da entrega.',
      'Pedir a quem recebe para assinar com o dedo.',
      'Escrever o PIN de 4 algarismos que quem recebe te dá.',
    ]);
    expect(() => payloadPod(ENTREGA, { ...pod, assinatura: null }, null)).toThrow('Pedir a quem recebe para assinar com o dedo.');
  });

  test('payload da fila: marcadores das fotos, PIN, local e extras', () => {
    expect(payloadPod(ENTREGA, pod, null)).toEqual({
      delivery_id: ENTREGA,
      new_status: 'DELIVERED',
      pin: '4821',
      is_volumoso: true,
      is_espera_longa: false,
      proof: {
        photo_url: 'offline:f1',
        signature_url: 'offline:a1',
        latitude: -12.7761,
        longitude: 15.7392,
        observation: 'Deixei com a vizinha',
      },
    });
  });

  test('a prova assinada pela app confere com as regras do servidor (local e SHA-256 da foto e da assinatura)', async () => {
    const chave = p256.utils.randomSecretKey();
    const assinar = criarAssinarProva({
      assinar: async (m) => ({ deviceId: 'aparelho-1', assinatura: p256.sign(m, chave, { prehash: true, lowS: true, format: 'compact' }) }),
    });
    const cripto = paraCamposProva(
      await assinar({
        delivery_id: ENTREGA,
        lat: pod.local!.latitude,
        lng: pod.local!.longitude,
        plus_code: pod.local!.plusCode,
        foto_sha256: SHA_FOTO,
        assinatura_manuscrita_sha256: SHA_ASSINATURA,
      }),
    );
    const payload = payloadPod(ENTREGA, pod, cripto);
    expect(verificarAssinatura(payload.proof.crypto_payload!, payload.proof.crypto_signature!, chavePublicaParaJwk(p256.getPublicKey(chave, false)))).toBe(true);
    // O servidor compara a mensagem assinada com a prova recebida.
    expect(
      diferencaNaMensagem(payload.proof.crypto_payload!, {
        deliveryId: ENTREGA,
        latitude: payload.proof.latitude,
        longitude: payload.proof.longitude,
        fotoSha256: SHA_FOTO,
        assinaturaSha256: SHA_ASSINATURA,
        agora: new Date(),
      }),
    ).toBeNull();
  });

  test('depois do envio (marcadores trocados pelo URL da pasta do estafeta), o servidor aceita os ficheiros', () => {
    const url = 'https://projeto.supabase.co';
    const proof = {
      photo_url: `${url}/storage/v1/object/public/delivery-proofs/${ESTAFETA}/offline-f1.jpg`,
      signature_url: `${url}/storage/v1/object/public/delivery-proofs/${ESTAFETA}/offline-a1.png`,
    };
    expect(validarFicheirosProva('DELIVERED', proof, ESTAFETA, url)).toMatchObject({ ok: true });
  });
});

describe('estafeta: passos simples e falha', () => {
  test('a recolha sem foto não sai do telemóvel; com foto leva o local', () => {
    const recolha = proximoPasso('ASSIGNED')!;
    expect(() => payloadPasso(ENTREGA, recolha, null, null)).toThrow('Tira a foto da encomenda recolhida.');
    expect(payloadPasso(ENTREGA, recolha, pod.foto, pod.local)).toEqual({
      delivery_id: ENTREGA,
      new_status: 'PICKED_UP',
      proof: { photo_url: 'offline:f1', latitude: -12.7761, longitude: 15.7392 },
    });
    expect(payloadPasso(ENTREGA, proximoPasso('PICKED_UP')!, null, null)).toEqual({ delivery_id: ENTREGA, new_status: 'IN_TRANSIT' });
  });

  test('falha: motivo, observação e foto opcional', () => {
    expect(payloadFalha(ENTREGA, 'destinatario_ausente', ' ninguém ', null, null)).toEqual({
      delivery_id: ENTREGA,
      new_status: 'FAILED',
      reason: 'destinatario_ausente',
      proof: { observation: 'ninguém' },
    });
  });

  test('erros do servidor em palavras simples', () => {
    expect(mensagemErroEstafeta('PIN de confirmacao incorreto (restam 3 tentativas)')).toBe(
      'O PIN estava errado (restam 3 tentativas). Confirma o PIN com quem recebe e faz a prova de novo.',
    );
    expect(mensagemErroEstafeta('PIN_LOCKED: x')).toMatch(/bloqueada/);
    expect(mensagemErroEstafeta('PIN_EXPIRED: x')).toMatch(/expirou/);
    expect(mensagemErroEstafeta('transicao invalida: A -> B')).toMatch(/já não é possível/);
  });
});

describe('assinatura desenhada com o dedo', () => {
  test('caminho SVG dos traços; um toque só vira um ponto', () => {
    expect(caminhoSvg([[{ x: 1, y: 2 }, { x: 3.14, y: 4 }], [{ x: 10, y: 10 }]])).toBe('M1 2 L3.1 4 M10 10 L10.1 10');
    expect(caminhoSvg([])).toBe('');
  });

  test('um risco pequeno (toque sem querer) não conta como assinatura', () => {
    expect(assinaturaValida([[{ x: 0, y: 0 }, { x: 10, y: 0 }]])).toBe(false);
    expect(comprimento([[{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 80 }]])).toBe(100);
    expect(assinaturaValida([[{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 80 }]])).toBe(true);
  });
});
