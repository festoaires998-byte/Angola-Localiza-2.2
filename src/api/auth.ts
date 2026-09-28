import type { Factor } from '@supabase/supabase-js';

import { normalizarNome } from '@/domain/identidade/nome';
import { cofreApp } from '@/services/cofre/cofreApp';

import { criarAdesao, type ResultadoAdesao, type ResultadoConsumo } from './adesao';
import type { LinkAuth } from '@/services/links/linksProfundos';

import { chamarFuncao } from './edge/chamarFuncao';
import { ErroAuth } from './errosAuth';
import { supabase } from './supabase';
import type { CodigoPais } from '@/config/pais';

export { eErroDeRede, ErroAuth, traduzirErroAuth } from './errosAuth';
export type { ResultadoConsumo } from './adesao';

/**
 * Funções de sessão (sem ecrãs). Em caso de erro lançam ErroAuth, cuja
 * `message` já vem em português e pode ser mostrada ao utilizador.
 */

function falhar(erro: { message?: string } | null | undefined): never {
  throw new ErroAuth(erro?.message);
}

const adesao = criarAdesao(cofreApp, (token) =>
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
 * `redirecionarPara` é o link que o email de confirmação abre
 * (ex.: angolalocaliza://email-confirmado).
 */
export async function criarConta(
  email: string,
  password: string,
  nome: string,
  redirecionarPara?: string,
  countryCode: CodigoPais = 'AO',
): Promise<{ userId: string | null; precisaConfirmar: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: normalizarNome(nome), country_code: countryCode.trim().toUpperCase() },
      ...(redirecionarPara ? { emailRedirectTo: redirecionarPara } : {}),
    },
  });
  if (error) falhar(error);
  if (data.session) await consumirAdesaoPendente();
  return { userId: data.user?.id ?? null, precisaConfirmar: !data.session };
}

/** Guarda o nome completo na conta (user_metadata.full_name). Precisa de rede. */
export async function guardarNome(nome: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { full_name: normalizarNome(nome) } });
  if (error) falhar(error);
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

/**
 * Abre a sessão que vem num link do email (recuperação ou confirmação).
 * Lança ErroAuth (em português) se o link expirou ou não serve.
 */
export async function abrirSessaoDoLink(link: LinkAuth): Promise<void> {
  if (link.tipo === 'erro') falhar({ message: link.codigo === 'otp_expired' ? 'otp_expired' : link.mensagem });
  if (link.tipo === 'codigo') {
    const { error } = await supabase.auth.exchangeCodeForSession(link.codigo);
    if (error) falhar(error);
    return;
  }