import type { Factor } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { criarAdesao, type ResultadoAdesao, type ResultadoConsumo } from './adesao';
import { chamarFuncao } from './edge/chamarFuncao';
import { ErroAuth } from './errosAuth';
import { supabase } from './supabase';

export { ErroAuth, traduzirErroAuth } from './errosAuth';
export type { ResultadoConsumo } from './adesao';

/**
 * Funções de sessão (sem ecrãs). Em caso de erro lançam ErroAuth, cuja
 * `message` já vem em português e pode ser mostrada ao utilizador.
 */

function falhar(erro: { message?: string } | null | undefined): never {
  throw new ErroAuth(erro?.message);
}

const adesao = criarAdesao(SecureStore, (token) =>
  chamarFuncao<ResultadoAdesao>('join-link', 'consume', { body: { token } }),
);

// ─── Entrar, criar conta, palavra-passe, sair ───────────────────────────────

export interface ResultadoEntrar {
  userId: string;
  /** O que aconteceu ao link de adesão pendente (se havia um). */
  adesao: ResultadoConsumo;
}

/** Entra com email e palavra-passe. Depois consome o link de adesão pendente, se houver. */
export async function entrar(email: string, password: string): Promise<ResultadoEntrar> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.user) falhar(error);
  return { userId: data.user.id, adesao: await consumirAdesaoPendente() };
}

/**
 * Cria conta. Se o projeto exigir confirmação por email, `precisaConfirmar`
 * vem a true e ainda não há sessão.
 */
export async function criarConta(
  email: string,
  password: string,
): Promise<{ userId: string | null; precisaConfirmar: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) falhar(error);
  if (data.session) await consumirAdesaoPendente();
  return { userId: data.user?.id ?? null, precisaConfirmar: !data.session };
}

/**
 * Envia o email para recuperar a palavra-passe.
 * `redirecionarPara` é o link que o email abre (ex.: angolalocaliza://redefinir-password).
 */
export async function recuperarPassword(email: string, redirecionarPara?: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    redirecionarPara ? { redirectTo: redirecionarPara } : undefined,
  );
  if (error) falhar(error);
}

/** Muda a palavra-passe do utilizador com sessão (também depois do link de recuperação). */
export async function definirNovaPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) falhar(error);
}

/**
 * Sai da conta. Tenta terminar a sessão no servidor; sem rede, termina pelo
 * menos a sessão neste telemóvel.
 * NÃO apaga a fila de saída: as operações ficam guardadas com o user_id e só
 * são enviadas quando esse utilizador voltar a entrar. O ecrã deve avisar antes
 * (fila.contarPendentesDoUtilizador).
 */
export async function sair(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    const local = await supabase.auth.signOut({ scope: 'local' });
    if (local.error) falhar(local.error);
  }
}

// ─── MFA (TOTP) ────────────────────────────────────────────────────────────

export interface InscricaoTotp {
  factorId: string;
  /** Imagem SVG do QR code (para mostrar: "data:image/svg+xml;utf-8," + qrCode). */
  qrCode: string;
  /** otpauth://... (o mesmo que está no QR). */
  uri: string;
  /**
   * Chave secreta em texto, para escrever à mão na app autenticadora.
   * O ecrã mostra-a SEMPRE como alternativa ao QR. Nunca registar em logs.
   */
  segredo: string;
}

/** Começa a inscrição de um fator TOTP. Só fica ativo depois de verificarTotp(). */
export async function inscreverTotp(nomeAmigavel?: string): Promise<InscricaoTotp> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    ...(nomeAmigavel ? { friendlyName: nomeAmigavel } : {}),
  });
  if (error || !data) falhar(error);
  return { factorId: data.id, qrCode: data.totp.qr_code, uri: data.totp.uri, segredo: data.totp.secret };
}

/** Pede um desafio para o fator. Devolve o id do desafio. */
export async function desafiarTotp(factorId: string): Promise<string> {
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error || !data) falhar(error);
  return data.id;
}

/** Verifica o código de 6 dígitos para um desafio. A sessão passa a AAL2. */
export async function verificarTotp(
  factorId: string,
  challengeId: string,
  codigo: string,
): Promise<void> {
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: codigo.replace(/\s+/g, ''),
  });
  if (error) falhar(error);
}

/** Desafia e verifica de uma vez (o caso normal para TOTP). */
export async function desafiarEVerificarTotp(factorId: string, codigo: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: codigo.replace(/\s+/g, ''),
  });
  if (error) falhar(error);
}

/** Fatores do utilizador: todos e só os TOTP verificados. Precisa de rede. */
export async function listarFatores(): Promise<{ todos: Factor[]; totpVerificados: Factor[] }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) falhar(error);
  return { todos: data.all, totpVerificados: data.totp };
}

export interface NivelSessao {
  /** Nível atual; null se não há sessão. */
  atual: 'aal1' | 'aal2' | null;
  /** Nível que o utilizador pode atingir (aal2 se já tem um fator verificado). */
  proximo: 'aal1' | 'aal2' | null;
}

function paraNivel(valor: string | null | undefined): 'aal1' | 'aal2' | null {
  return valor === 'aal1' || valor === 'aal2' ? valor : null;
}

/**
 * Nível de garantia da sessão (AAL1/AAL2). É lido do token guardado neste
 * telemóvel, sem precisar de rede. Em caso de erro devolve null (quem usa
 * trata null como "não é AAL2").
 */
export async function nivelGarantia(): Promise<NivelSessao> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return { atual: null, proximo: null };
    return { atual: paraNivel(data.currentLevel), proximo: paraNivel(data.nextLevel) };
  } catch {
    return { atual: null, proximo: null };
  }
}

// ─── Link de adesão ────────────────────────────────────────────────────────

/** Guarda o token de um link de adesão para usar depois do login. */
export function guardarTokenAdesaoPendente(token: string): Promise<void> {
  return adesao.guardar(token);
}

/**
 * Envia o token guardado para POST /functions/v1/join-link?action=consume.
 * Apaga-o se aderiu ou se o link já não serve; mantém-no se falhou por rede.
 * Precisa de sessão iniciada.
 */
export function consumirAdesaoPendente(): Promise<ResultadoConsumo> {
  return adesao.consumir();
}
