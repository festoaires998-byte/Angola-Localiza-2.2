import { eCargo, type Cargo } from '@/domain/organizacao/cargos';

/**
 * Revisão das verificações simples dos cidadãos (as regras, sem React e sem rede).
 *
 * O servidor (citizen-verify: list_pending / review) só deixa rever quem é
 * administrador (função is_admin: super_admin, admin_nacional,
 * admin_provincial, admin_municipal). O auditor vê o separador Admin, mas
 * não decide.
 */

export const CARGOS_REVISORES: readonly Cargo[] = ['super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal'];

export function podeReverKyc(cargos: readonly unknown[] | null | undefined): boolean {
  return (cargos ?? []).some((c) => eCargo(c) && CARGOS_REVISORES.includes(c));
}

export interface PedidoKyc {
  userId: string;
  enviadoEm: string | null;
  /** Da conta do cidadão (null se não houver). */
  email: string | null;
  nome: string | null;
  telefone: string | null;
}

/**
 * Links temporários (10 minutos) para as 3 fotos privadas de um pedido
 * (citizen-verify?action=view; cada abertura fica registada no servidor).
 * null se a foto falta.
 */
export interface FotosKyc {
  frente: string | null;
  verso: string | null;
  selfie: string | null;
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/** Lê a resposta de list_pending (ignora linhas sem user_id). */
export function lerPedidosKyc(r: unknown): PedidoKyc[] {
  const o = (r ?? {}) as { error?: unknown; pending?: unknown };
  if (o.error) throw new Error(String(o.error));
  if (!Array.isArray(o.pending)) return [];
  return o.pending
    .map((p) => (p ?? {}) as Record<string, unknown>)
    .filter((p) => texto(p.user_id))
    .map((p) => ({
      userId: String(p.user_id),
      enviadoEm: texto(p.submitted_at),
      email: texto(p.email),
      nome: texto(p.name),
      telefone: texto(p.phone),
    }));
}

/** Lê a resposta de view. */
export function lerFotosKyc(r: unknown): FotosKyc {
  const o = (r ?? {}) as Record<string, unknown>;
  if (o.error) throw new Error(String(o.error));
  return { frente: texto(o.front_url), verso: texto(o.back_url), selfie: texto(o.selfie_url) };
}

/** Motivos mais comuns (um toque preenche o motivo; pode-se escrever outro). */
export const MOTIVOS_RAPIDOS = [
  'A foto do BI está desfocada ou ilegível.',
  'Falta uma parte do BI na foto.',
  'A selfie não mostra bem a cara.',
  'A pessoa da selfie não é a do BI.',
  'O gesto pedido não aparece na segunda selfie.',
] as const;

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 300;

/** Para recusar é preciso um motivo (o cidadão vê-o). Devolve o erro, ou null se está bem. */
export function erroMotivo(motivo: string): string | null {
  const m = motivo.trim();
  if (m.length < MOTIVO_MIN) return 'Escreve o motivo da recusa (o cidadão vai vê-lo).';
  if (m.length > MOTIVO_MAX) return `O motivo é demasiado longo (máximo ${MOTIVO_MAX} letras).`;
  return null;
}

/** Id curto para mostrar (os 8 primeiros caracteres). */
export const idCurto = (userId: string) => userId.slice(0, 8);

/** Como identificar o cidadão no ecrã: o nome, senão o email, senão o id curto. */
export function nomeDoPedido(p: Pick<PedidoKyc, 'userId' | 'nome' | 'email'>): string {
  return p.nome ?? p.email ?? `Cidadão ${idCurto(p.userId)}`;
}

/** As outras informações (email, telefone e id), sem repetir o que já está no nome. */
export function detalhesDoPedido(p: Pick<PedidoKyc, 'userId' | 'nome' | 'email' | 'telefone'>): string[] {
  const linhas: string[] = [];
  if (p.nome && p.email) linhas.push(`Email: ${p.email}`);
  if (p.telefone) linhas.push(`Telefone: ${p.telefone}`);
  if (p.nome || p.email) linhas.push(`Id: ${idCurto(p.userId)}`);
  return linhas;
}

/** "24/09/2026 14:05" (hora do telemóvel). */
export function dataEnvio(iso: string | null): string {
  if (!iso) return 'data desconhecida';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'data desconhecida';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
