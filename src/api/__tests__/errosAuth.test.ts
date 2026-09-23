import { describe, expect, test } from '@jest/globals';

import { ErroAuth, traduzirErroAuth } from '../errosAuth';

describe('traduzirErroAuth', () => {
  test.each<[string | null | undefined, string]>([
    ['Invalid login credentials', 'Email ou palavra-passe incorretos.'],
    ['Email not confirmed', 'Confirma o teu email antes de entrares (verifica a caixa de entrada).'],
    ['User already registered', 'Já existe uma conta com este email.'],
    ['Password should be at least 6 characters.', 'A palavra-passe é demasiado curta (mínimo 6 caracteres).'],
    ['Unable to validate email address: invalid format', 'Este email não parece válido.'],
    ['Email address "x" is invalid email', 'Este email não parece válido.'],
    ['Invalid email', 'Este email não parece válido.'],
    ['Email rate limit exceeded', 'Foram feitos demasiados pedidos seguidos — espera um pouco e tenta outra vez.'],
    ['Token has expired or is invalid', 'Este link expirou ou já foi usado. Pede um novo.'],
    ['token is invalid', 'Este link expirou ou já foi usado. Pede um novo.'],
    ['otp_expired', 'Este link expirou ou já foi usado. Pede um novo.'],
    ['Email link is invalid or has expired', 'Este link expirou ou já foi usado. Pede um novo.'],
    ['New password should be different from the old password. same password', 'A nova palavra-passe tem de ser diferente da anterior.'],
    ['Algo diferente aconteceu', 'Algo diferente aconteceu'],
    ['', 'Erro ao processar.'],
    ['   ', 'Erro ao processar.'],
    [null, 'Erro ao processar.'],
    [undefined, 'Erro ao processar.'],
  ])('%j → %j', (entrada, esperado) => {
    expect(traduzirErroAuth(entrada)).toBe(esperado);
  });

  test('ErroAuth guarda a original e mostra a tradução', () => {
    const e = new ErroAuth('Invalid login credentials');
    expect(e.message).toBe('Email ou palavra-passe incorretos.');
    expect(e.original).toBe('Invalid login credentials');
  });
});
