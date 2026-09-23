import { p256 } from '@noble/curves/nist.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

import { relogioDoSistema, type Relogio } from '@/database/util';

import { deBase64, paraBase64 } from './base64';
import { jwkParaChavePublica } from './jwk';

export const ALGORITMO_ASSINATURA = 'ECDSA-SHA256';

/** Versão da mensagem assinada (o site usa a versão 1, sem o campo "versao"). */
export const VERSAO_MENSAGEM = 2;

export interface DadosProva {
  delivery_id: string;
  lat: number;
  lng: number;
  plus_code: string;
  /** SHA-256 (hex) da foto final, já com a marca de água; null se a prova não tem foto. */
  foto_sha256: string | null;
  /** SHA-256 (hex) da imagem da assinatura manuscrita; null se não houver. */
  assinatura_manuscrita_sha256: string | null;
}

export interface ProvaAssinada {
  /** Texto exato que foi assinado. Vai para proof.crypto_payload. */
  payload_assinado: string;
  /** 64 bytes r||s em base64 normal. */
  assinatura: string;
  algoritmo: typeof ALGORITMO_ASSINATURA;
  device_id: string;
}

export interface AssinadorProva {
  assinar(mensagem: Uint8Array): Promise<{ deviceId: string; assinatura: Uint8Array }>;
}

function hashOuNull(valor: unknown, nome: string): string | null {
  if (valor === null) return null;
  if (typeof valor !== 'string' || !/^[0-9a-f]{64}$/i.test(valor)) {
    throw new Error(`${nome} tem de ser um SHA-256 em hex (64 caracteres) ou null.`);
  }
  return valor.toLowerCase();
}

/**
 * Mensagem versão 2. A ordem dos campos é fixa: o servidor verifica a
 * assinatura sobre o texto tal como chega, por isso o texto nunca é refeito.
 */
export function construirMensagem(dados: DadosProva, timestamp: string): string {
  if (typeof dados.delivery_id !== 'string' || dados.delivery_id.trim() === '') {
    throw new Error('delivery_id é obrigatório.');
  }
  if (!Number.isFinite(dados.lat) || Math.abs(dados.lat) > 90) throw new Error('lat inválida.');
  if (!Number.isFinite(dados.lng) || Math.abs(dados.lng) > 180) throw new Error('lng inválida.');
  if (typeof dados.plus_code !== 'string' || dados.plus_code.trim() === '') {
    throw new Error('plus_code é obrigatório.');
  }
  return JSON.stringify({
    versao: VERSAO_MENSAGEM,
    delivery_id: dados.delivery_id,
    lat: dados.lat,
    lng: dados.lng,
    timestamp,
    plus_code: dados.plus_code,
    foto_sha256: hashOuNull(dados.foto_sha256, 'foto_sha256'),
    assinatura_manuscrita_sha256: hashOuNull(
      dados.assinatura_manuscrita_sha256,
      'assinatura_manuscrita_sha256',
    ),
  });
}

/** Cria assinarProva(). Funciona sem rede: a chave está no telemóvel. */
export function criarAssinarProva(assinador: AssinadorProva, relogio: Relogio = relogioDoSistema) {
  return async function assinarProva(dados: DadosProva): Promise<ProvaAssinada> {
    const payload = construirMensagem(dados, relogio().toISOString());
    const { deviceId, assinatura } = await assinador.assinar(utf8ToBytes(payload));
    return {
      payload_assinado: payload,
      assinatura: paraBase64(assinatura),
      algoritmo: ALGORITMO_ASSINATURA,
      device_id: deviceId,
    };
  };
}

/** Campos com os nomes que a Edge Function "deliveries" lê em `proof`. */
export function paraCamposProva(prova: ProvaAssinada) {
  return {
    crypto_payload: prova.payload_assinado,
    crypto_signature: prova.assinatura,
    crypto_algorithm: prova.algoritmo,
    crypto_device_id: prova.device_id,
  };
}

/**
 * Faz a mesma verificação que o servidor: ECDSA P-256 / SHA-256 sobre os
 * bytes UTF-8 do texto, assinatura r||s em base64. Aceita S alto (como o Web Crypto).
 */
export function verificarAssinatura(payload: string, assinaturaBase64: string, jwk: unknown): boolean {
  try {
    const assinatura = deBase64(assinaturaBase64);
    if (assinatura.length !== 64) return false;
    return p256.verify(assinatura, utf8ToBytes(payload), jwkParaChavePublica(jwk), {
      prehash: true,
      lowS: false,
      format: 'compact',
    });
  } catch {
    return false;
  }
}
