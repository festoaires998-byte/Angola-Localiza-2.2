import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { RepositorioChavesDispositivo } from '@/database/repositories/chavesDispositivo';

import { chavePublicaParaJwk, mesmaChave, type JwkPublicaP256 } from './jwk';

/** Nome do item no expo-secure-store com a chave PRIVADA de assinatura. */
export const NOME_CHAVE_ASSINATURA = 'angola_localiza.chave_assinatura';

/** Formato guardado: "v1:<device_id>:<chave privada em hex>". */
const VERSAO = 'v1';

/** O que o expo-secure-store faz (as opções de acesso são postas por quem liga à app). */
export interface CofreChavePrivada {
  getItemAsync(nome: string): Promise<string | null>;
  setItemAsync(nome: string, valor: string): Promise<void>;
  deleteItemAsync(nome: string): Promise<void>;
}

export interface SessaoRegisto {
  userId: string;
  accessToken: string;
}

export interface CorpoRegisto {
  device_id: string;
  public_key_jwk: JwkPublicaP256;
}

/** Resultado de garantirChaveRegistada(). */
export type ResultadoRegisto =
  | { tipo: 'ok'; deviceId: string; jwk: JwkPublicaP256 }
  /** O servidor recusou a sessão (401). */
  | { tipo: 'sessao' }
  /** Sem rede, sem sessão, cofre fechado ou erro do servidor: tentar mais tarde. */
  | { tipo: 'falhou'; erro: string };

export interface DependenciasChave {
  cofre: CofreChavePrivada;
  chaves: Pick<RepositorioChavesDispositivo, 'obter' | 'guardar' | 'marcarRegistada'>;
  obterIdDispositivo(): Promise<string>;
  /** Garante crypto.getRandomValues antes de o @noble gerar a chave. */
  prepararAleatorio(): void;
  /**
   * Se ler o cofre der erro, a chave perdeu-se (true) ou só não se pode ler
   * agora (false)? No iOS o erro costuma ser o telemóvel ainda não ter sido
   * desbloqueado depois de ligar: aí NÃO se gera outra chave.
   */
  erroDeLeituraEPerda: boolean;
  obterSessao(): Promise<SessaoRegisto | null>;
  estaOnline(): Promise<boolean>;
  /** POST signing-keys?action=register. Devolve 'ok', 'sessao' (401) ou a mensagem de erro. */
  pedirRegisto(token: string, corpo: CorpoRegisto): Promise<'ok' | 'sessao' | string>;
}

interface ChaveCarregada {
  deviceId: string;
  jwk: JwkPublicaP256;
  chavePrivada: Uint8Array;
}

function lerGuardado(valor: string | null, deviceId: string): Uint8Array | null {
  if (!valor) return null;
  const partes = valor.split(':');
  if (partes.length !== 3 || partes[0] !== VERSAO || partes[1] !== deviceId) return null;
  if (!/^[0-9a-f]{64}$/.test(partes[2])) return null;
  const chave = hexToBytes(partes[2]);
  return p256.utils.isValidSecretKey(chave) ? chave : null;
}

/**
 * Chave ECDSA P-256 deste aparelho.
 *
 * - A chave privada só existe no expo-secure-store (nunca no SQLite).
 * - A chave pública fica na tabela chaves_dispositivo, em JWK.
 * - Se a chave privada desapareceu (ex.: backup restaurado), gera-se outra,
 *   que fica "não registada" até garantirChaveRegistada() a enviar ao servidor.
 */
export function criarChaveDispositivo(deps: DependenciasChave) {
  let pedido: Promise<ChaveCarregada> | null = null;

  async function carregar(): Promise<ChaveCarregada> {
    const deviceId = await deps.obterIdDispositivo();
    let guardado: string | null;
    try {
      guardado = await deps.cofre.getItemAsync(NOME_CHAVE_ASSINATURA);
    } catch (erro) {
      if (!deps.erroDeLeituraEPerda) throw erro;
      guardado = null;
    }

    const existente = lerGuardado(guardado, deviceId);
    if (existente) {
      const jwk = chavePublicaParaJwk(p256.getPublicKey(existente, false));
      const linha = await deps.chaves.obter(deviceId);
      // A app fechou entre gravar no cofre e no SQLite (ou o SQLite é de outra chave).
      if (!linha || !mesmaChave(linha.chave_publica_jwk, jwk)) {
        await deps.chaves.guardar({ device_id: deviceId, chave_publica_jwk: jwk });
      }
      return { deviceId, jwk, chavePrivada: existente };
    }

    deps.prepararAleatorio();
    const { secretKey, publicKey } = p256.keygen();
    const valor = `${VERSAO}:${deviceId}:${bytesToHex(secretKey)}`;
    // Apagar antes: no iOS gravar por cima não muda a opção de acesso do item.
    await deps.cofre.deleteItemAsync(NOME_CHAVE_ASSINATURA).catch(() => undefined);
    await deps.cofre.setItemAsync(NOME_CHAVE_ASSINATURA, valor);
    if ((await deps.cofre.getItemAsync(NOME_CHAVE_ASSINATURA)) !== valor) {
      throw new Error('Não foi possível guardar a chave de assinatura no cofre.');
    }
    const jwk = chavePublicaParaJwk(publicKey);
    // Chave nova: fica "não registada" (INSERT OR REPLACE apaga o registo da antiga).
    await deps.chaves.guardar({ device_id: deviceId, chave_publica_jwk: jwk });
    return { deviceId, jwk, chavePrivada: secretKey };
  }

  function obterChave(): Promise<ChaveCarregada> {
    if (!pedido) {
      pedido = carregar().catch((erro) => {
        pedido = null;
        throw erro;
      });
    }
    return pedido;
  }

  return {
    /** Gera a chave (se ainda não existir) e devolve a parte pública. */
    async chavePublica(): Promise<{ deviceId: string; jwk: JwkPublicaP256 }> {
      const { deviceId, jwk } = await obterChave();
      return { deviceId, jwk };
    },

    /**
     * ECDSA P-256 com SHA-256 sobre os bytes da mensagem: 64 bytes r||s
     * (o formato do Web Crypto). Não precisa de rede.
     */
    async assinar(mensagem: Uint8Array): Promise<{ deviceId: string; assinatura: Uint8Array }> {
      const { deviceId, chavePrivada } = await obterChave();
      const assinatura = p256.sign(mensagem, chavePrivada, {
        prehash: true,
        lowS: true,
        format: 'compact',
      });
      return { deviceId, assinatura };
    },

    /**
     * Garante que o servidor conhece a chave pública deste aparelho para o
     * utilizador da sessão. Só usa a rede se ainda não estiver registada.
     */
    async garantirChaveRegistada(sessaoDada?: SessaoRegisto): Promise<ResultadoRegisto> {
      try {
        const sessao = sessaoDada ?? (await deps.obterSessao());
        if (!sessao) return { tipo: 'falhou', erro: 'Sem sessão iniciada.' };
        const { deviceId, jwk } = await obterChave();
        const linha = await deps.chaves.obter(deviceId);
        if (
          linha?.registada &&
          linha.registada_user_id === sessao.userId &&
          mesmaChave(linha.chave_publica_jwk, jwk)
        ) {
          return { tipo: 'ok', deviceId, jwk };
        }
        if (!(await deps.estaOnline())) {
          return { tipo: 'falhou', erro: 'Sem rede para registar a chave do aparelho.' };
        }
        const r = await deps.pedirRegisto(sessao.accessToken, {
          device_id: deviceId,
          public_key_jwk: jwk,
        });
        if (r === 'sessao') return { tipo: 'sessao' };
        if (r !== 'ok') return { tipo: 'falhou', erro: r };
        await deps.chaves.marcarRegistada(deviceId, sessao.userId);
        return { tipo: 'ok', deviceId, jwk };
      } catch (erro) {
        return { tipo: 'falhou', erro: erro instanceof Error ? erro.message : String(erro) };
      }
    },
  };
}

export type ChaveDispositivo = ReturnType<typeof criarChaveDispositivo>;
