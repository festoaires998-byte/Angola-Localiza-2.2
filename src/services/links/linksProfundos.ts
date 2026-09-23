/**
 * Links profundos da app (scheme "angolalocaliza"). Só leitura de URLs:
 * não faz pedidos nem navega (é testável sem telemóvel).
 *
 * Endereços que o Supabase pode abrir (têm de estar em Authentication →
 * URL Configuration → Redirect URLs):
 * - LINK_NOVA_PASSWORD: email "Recuperar palavra-passe";
 * - LINK_EMAIL_CONFIRMADO: email "Confirma o teu email" (criar conta).
 *
 * O link de adesão (angolalocaliza://adesao?token=…) não passa pelo Supabase
 * Auth: é partilhado diretamente e abre a app.
 */

export const ESQUEMA = 'angolalocaliza';
export const LINK_NOVA_PASSWORD = `${ESQUEMA}://nova-password`;
export const LINK_EMAIL_CONFIRMADO = `${ESQUEMA}://email-confirmado`;

export type LinkAuth =
  /** Fluxo "implicit" (o do supabase-js por omissão): os tokens vêm no URL. */
  | { tipo: 'tokens'; accessToken: string; refreshToken: string; motivo: string | null }
  /** Fluxo "pkce": vem um código para trocar por sessão. */
  | { tipo: 'codigo'; codigo: string }
  /** O Supabase recusou o link (ex.: expirado); `mensagem` vem em inglês. */
  | { tipo: 'erro'; codigo: string | null; mensagem: string };

/** Parâmetros da query (?a=1) e do fragmento (#b=2), juntos. O fragmento ganha. */
export function parametrosDoUrl(url: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  const [semFragmento, fragmento = ''] = url.split('#', 2);
  const query = semFragmento.includes('?') ? semFragmento.slice(semFragmento.indexOf('?') + 1) : '';
  for (const parte of [query, fragmento]) {
    for (const par of parte.split('&')) {
      if (!par) continue;
      const i = par.indexOf('=');
      const chave = i < 0 ? par : par.slice(0, i);
      const valor = i < 0 ? '' : par.slice(i + 1);
      try {
        resultado[decodeURIComponent(chave)] = decodeURIComponent(valor.replace(/\+/g, ' '));
      } catch {
        resultado[chave] = valor;
      }
    }
  }
  return resultado;
}

/** Caminho do link, sem o scheme: "angolalocaliza://adesao?x" → "adesao". */
export function caminhoDoLink(url: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/\/?([^?#]*)/i.exec(url.trim());
  if (!m || m[1].toLowerCase() !== ESQUEMA) return null;
  return m[2].replace(/\/+$/, '').toLowerCase();
}

/** É um link de volta do Supabase Auth (recuperação ou confirmação de email)? */
export function lerLinkAuth(url: string): LinkAuth | null {
  const caminho = caminhoDoLink(url);
  if (caminho !== 'nova-password' && caminho !== 'email-confirmado') return null;
  const p = parametrosDoUrl(url);
  if (p.error || p.error_code || p.error_description) {
    return {
      tipo: 'erro',
      codigo: p.error_code || p.error || null,
      mensagem: p.error_description || p.error_code || p.error || '',
    };
  }
  if (p.access_token && p.refresh_token) {
    return {
      tipo: 'tokens',
      accessToken: p.access_token,
      refreshToken: p.refresh_token,
      motivo: p.type || null,
    };
  }
  if (p.code) return { tipo: 'codigo', codigo: p.code };
  return null;
}

/** Token de um link de adesão (angolalocaliza://adesao?token=…), ou null. */
export function lerLinkAdesao(url: string): string | null {
  if (caminhoDoLink(url) !== 'adesao') return null;
  const token = parametrosDoUrl(url).token?.trim();
  return token ? token : null;
}
