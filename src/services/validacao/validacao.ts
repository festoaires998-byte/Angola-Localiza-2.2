import { chamarFuncao } from '@/api/edge/chamarFuncao';

export interface ValidacaoCampo {
  id: string; latitude: number; longitude: number; reference: string | null; collected_at: string;
  photo_url: string | null; photo_qr_url: string | null; status: string;
  duplicate_of_address_id: string | null; duplicate_override_reason: string | null;
  infill_base_house_number: number | null; street_id: string | null; watermark_match: boolean | null;
  streets?: { name?: string | null } | null; quadras?: { code?: string | null } | null;
  preview_house_number?: string | null;
}
export async function listarValidacoesPendentes(): Promise<ValidacaoCampo[]> {
  const r = await chamarFuncao<{ records?: ValidacaoCampo[] }>('field-service', 'list_pending');
  return r.records ?? [];
}
export type DecisaoValidacao = 'approve' | 'duplicate' | 'merge' | 'reject';
export function validarLevantamento(id: string, decision: DecisaoValidacao) {
  return chamarFuncao('field-service', 'validate', { body: { field_record_id: id, decision }, tempoMaximo: 30_000 });
}

export interface ContextoQuadraValidacao { quadra_code: string; quadra_id?: string; area_m2: number; kind: string; streets: Array<{ id:string; name:string; next_seq:number; numbering_mode:string }>; neighborhoods_nearby: string[]; }
export function listarQuadraAtual(latitude: number, longitude: number) {
  return chamarFuncao<ContextoQuadraValidacao>('field-service', 'list_streets_in_quadra', { body: { latitude, longitude } });
}
