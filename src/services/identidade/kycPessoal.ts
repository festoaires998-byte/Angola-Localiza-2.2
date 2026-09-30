import { chamarFuncao } from '@/api/edge/chamarFuncao';
import { supabase } from '@/api/supabase';

// Verificação de identidade do pessoal (técnicos, estafetas, supervisores…):
// BI frente e verso + vídeo de 8 a 15 s a cumprir 3 desafios, revisto por uma
// pessoa (Edge Function identity-kyc v3). Os ficheiros vão para o bucket
// privado kyc-artifacts, na pasta da pessoa ("<id>/…").

export const BI_REGEX = /^\d{9}[A-Z]{2}\d{2}$/;
export const VIDEO_MIN_S = 8;
export const VIDEO_MAX_S = 15;

export interface EstadoKycPessoal {
  status: string;
  resend_count: number;
  cooldown_until: string | null;
  protocol: string | null;
  submitted_at: string | null;
  last_rejection_reason: string | null;
}

export type SituacaoKyc =
  | { tipo: 'verificado' }
  | { tipo: 'bloqueado'; ate: string }
  | { tipo: 'em_revisao'; protocolo: string; horas: number }
  | { tipo: 'por_enviar'; tentativa: number; motivoAnterior: string | null };

/** O que o ecrã deve mostrar, a partir do estado do servidor. */
export function situacaoKyc(e: EstadoKycPessoal, agora = new Date()): SituacaoKyc {
  if (e.status === 'ID_VERIFIED') return { tipo: 'verificado' };
  if (e.cooldown_until && new Date(e.cooldown_until) > agora) return { tipo: 'bloqueado', ate: e.cooldown_until };
  if (e.protocol && !e.last_rejection_reason) {
    const horas = e.submitted_at ? Math.max(0, Math.round((agora.getTime() - new Date(e.submitted_at).getTime()) / 3600000)) : 0;
    return { tipo: 'em_revisao', protocolo: e.protocol, horas };
  }
  return { tipo: 'por_enviar', tentativa: (e.resend_count ?? 0) + 1, motivoAnterior: e.last_rejection_reason };
}

export function numeroBiValido(v: string): boolean {
  return BI_REGEX.test(v.trim().toUpperCase());
}

/** Duração do vídeo (em segundos) aceite pelo servidor? */
export function duracaoVideoValida(segundos: number | null | undefined): boolean {
  return typeof segundos === 'number' && segundos >= VIDEO_MIN_S && segundos <= VIDEO_MAX_S;
}

/** Tipo do vídeo a partir do nome do ficheiro (o bucket aceita mp4, mov e webm). */
export function tipoVideo(uri: string): { contentType: string; extensao: string } {
  const e = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (e === 'mov') return { contentType: 'video/quicktime', extensao: 'mov' };
  if (e === 'webm') return { contentType: 'video/webm', extensao: 'webm' };
  return { contentType: 'video/mp4', extensao: 'mp4' };
}

/** Envia um ficheiro local para kyc-artifacts/<id>/<nome> e devolve o caminho. */
export async function enviarFicheiroKyc(userId: string, uri: string, nome: string, contentType: string): Promise<string> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Não foi possível ler o ficheiro gravado.');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('O ficheiro gravado está vazio.');
  const caminho = `${userId}/${nome}`;
  const { error } = await supabase.storage.from('kyc-artifacts').upload(caminho, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return caminho;
}

export const kycPessoal = {
  estado: () => chamarFuncao<EstadoKycPessoal>('identity-kyc', 'status'),
  desafio: async () => (await chamarFuncao<{ challenge_sequence: string[] }>('identity-kyc', 'get_challenge')).challenge_sequence ?? [],
  enviar: (pedido: {
    id_number: string; id_photo_url: string; id_photo_back_url: string; video_url: string;
    video_duration_seconds: number; challenge_sequence: string[];
  }) => chamarFuncao<{ ok: boolean; protocol: string }>('identity-kyc', 'submit_liveness', { body: pedido, tempoMaximo: 30_000 }),

  // Revisão (Super Admin, Admin Nacional ou Auditor).
  pendentes: async () =>
    (await chamarFuncao<{ verifications: PedidoKycPessoal[] }>('identity-kyc', 'list_pending_review')).verifications ?? [],
  artefacto: async (verificationId: string, artefacto: 'id_photo' | 'back' | 'video') =>
    (await chamarFuncao<{ url?: string }>('identity-kyc', 'view_artifact', { body: { verification_id: verificationId, artifact: artefacto } })).url ?? null,
  decidir: (verificationId: string, decisao: 'approve' | 'reject', motivo?: string) =>
    chamarFuncao<{ ok: boolean }>('identity-kyc', 'review_decision', { body: { verification_id: verificationId, decision: decisao, reason: motivo ?? null } }),
};

export interface PedidoKycPessoal {
  id: string;
  user_id: string;
  method: string;
  id_last4: string | null;
  created_at: string;
  email?: string | null;
  protocol: string;
}

/** O que o revisor tem de confirmar antes de aprovar (igual ao site). */
export const CHECKLIST_KYC: [string, string][] = [
  ['bi_angolano', 'É um BI angolano (não outro cartão)'],
  ['frente_legivel', 'Frente legível e o número coincide'],
  ['verso_legivel', 'Verso legível'],
  ['rosto_igual', 'O rosto do vídeo é igual à foto do BI'],
  ['desafios_cumpridos', 'Os desafios do vídeo foram cumpridos'],
];

export function cargoPodeReverKycPessoal(cargos: string[]): boolean {
  return cargos.some((c) => ['super_admin', 'admin_nacional', 'auditor'].includes(c));
}
