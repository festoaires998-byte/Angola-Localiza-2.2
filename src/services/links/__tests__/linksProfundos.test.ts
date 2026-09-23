import { describe, expect, test } from '@jest/globals';

import {
  caminhoDoLink,
  LINK_EMAIL_CONFIRMADO,
  LINK_NOVA_PASSWORD,
  lerLinkAdesao,
  lerLinkAuth,
} from '../linksProfundos';

describe('links profundos', () => {
  test('os endereços para o Supabase são estes (não mudar sem mudar lá)', () => {
    expect(LINK_NOVA_PASSWORD).toBe('angolalocaliza://nova-password');
    expect(LINK_EMAIL_CONFIRMADO).toBe('angolalocaliza://email-confirmado');
  });

  test('caminho do link', () => {
    expect(caminhoDoLink('angolalocaliza://adesao?token=x')).toBe('adesao');
    expect(caminhoDoLink('angolalocaliza:///nova-password#a=1')).toBe('nova-password');
    expect(caminhoDoLink('https://exemplo.ao/adesao')).toBeNull();
  });

  test('recuperação (fluxo implicit): tokens no fragmento', () => {
    expect(
      lerLinkAuth(`${LINK_NOVA_PASSWORD}#access_token=aaa&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery`),
    ).toEqual({ tipo: 'tokens', accessToken: 'aaa', refreshToken: 'rrr', motivo: 'recovery' });
  });

  test('confirmação de email: tokens com type=signup', () => {
    expect(lerLinkAuth(`${LINK_EMAIL_CONFIRMADO}#access_token=a&refresh_token=r&type=signup`)).toMatchObject({
      tipo: 'tokens',
      motivo: 'signup',
    });
  });

  test('fluxo pkce: código na query', () => {
    expect(lerLinkAuth(`${LINK_NOVA_PASSWORD}?code=abc`)).toEqual({ tipo: 'codigo', codigo: 'abc' });
  });

  test('link expirado', () => {
    expect(
      lerLinkAuth(
        `${LINK_NOVA_PASSWORD}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
      ),
    ).toEqual({ tipo: 'erro', codigo: 'otp_expired', mensagem: 'Email link is invalid or has expired' });
  });

  test('outros links não são de autenticação', () => {
    expect(lerLinkAuth('angolalocaliza://adesao?token=x')).toBeNull();
    expect(lerLinkAuth(LINK_NOVA_PASSWORD)).toBeNull();
  });

  test('link de adesão', () => {
    expect(lerLinkAdesao('angolalocaliza://adesao?token=abc%2B123')).toBe('abc+123');
    expect(lerLinkAdesao('angolalocaliza://adesao?token=')).toBeNull();
    expect(lerLinkAdesao('angolalocaliza://adesao')).toBeNull();
    expect(lerLinkAdesao('angolalocaliza://outra?token=x')).toBeNull();
  });
});
