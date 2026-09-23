import type { EstadoSessao } from './criarSessao';

/** Para onde a app deve ir com a sessão atual ('carregar' = ainda não se sabe). */
export type Destino = 'carregar' | '/entrar' | '/codigo-mfa' | '/ativar-mfa' | '/mapa';

export function destinoDaSessao(
  e: Pick<EstadoSessao, 'carregado' | 'utilizador' | 'perfilLido' | 'acesso'>,
): Destino {
  if (!e.carregado) return 'carregar';
  if (!e.utilizador) return '/entrar';
  if (!e.perfilLido) return 'carregar';
  if (e.acesso.faltaMfa) return e.acesso.passoMfa === 'inscrever' ? '/ativar-mfa' : '/codigo-mfa';
  return '/mapa';
}
