/**
 * Traduz as mensagens de erro do Supabase Auth para português
 * (as mesmas traduções do site).
 */
const TRADUCOES: readonly [readonly string[], string][] = [
  [['invalid login credentials'], 'Email ou palavra-passe incorretos.'],
  [['email not confirmed'], 'Confirma o teu email antes de entrares (verifica a caixa de entrada).'],
  [['user already registered'], 'Já existe uma conta com este email.'],
  [['password should be at least'], 'A palavra-passe é demasiado curta (mínimo 6 caracteres).'],
  [['unable to validate email', 'invalid email'], 'Este email não parece válido.'],
  [['rate limit'], 'Foram feitos demasiados pedidos seguidos — espera um pouco e tenta outra vez.'],
  [
    ['token has expired', 'token is invalid', 'otp_expired', 'link is invalid or has expired'],
    'Este link expirou ou já foi usado. Pede um novo.',
  ],
  [['same password'], 'A nova palavra-passe tem de ser diferente da anterior.'],
  [
    ['invalid totp code', 'invalid mfa code', 'totp code', 'challenge and verify'],
    'O código está errado ou já mudou. Escreve o código que aparece agora na app de autenticação.',
  ],
  [
    ['network request failed', 'failed to fetch', 'fetch failed', 'network error', 'sem ligação'],
    'Sem ligação à internet. Liga os dados móveis ou o Wi-Fi e tenta outra vez.',
  ],
];

/** A mensagem (original, em inglês) indica falta de rede? */
export function eErroDeRede(mensagem: string | null | undefined): boolean {
  const m = (mensagem ?? '').toLowerCase();
  return ['network request failed', 'failed to fetch', 'fetch failed', 'network error', 'sem ligação'].some(
    (p) => m.includes(p),
  );
}

export function traduzirErroAuth(mensagem: string | null | undefined): string {
  const texto = (mensagem ?? '').trim();
  if (!texto) return 'Erro ao processar.';
  const minusculas = texto.toLowerCase();
  for (const [pedacos, traducao] of TRADUCOES) {
    if (pedacos.some((p) => minusculas.includes(p))) return traducao;
  }
  return texto;
}

/** Erro lançado pelas funções de src/api/auth.ts, já com a mensagem em português. */
export class ErroAuth extends Error {
  /** Mensagem original do Supabase (para registos, não para mostrar). */
  readonly original: string;
  constructor(original: string | null | undefined) {
    super(traduzirErroAuth(original));
    this.name = 'ErroAuth';
    this.original = original ?? '';
  }
}
