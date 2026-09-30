import { chamarFuncao } from '@/api/edge/chamarFuncao';

export type DriverApplication = {
  id: string; user_id: string; country_code: string; status: 'DRAFT'|'PENDING_REVIEW'|'APPROVED'|'REJECTED';
  vehicle_type: string|null; vehicle_plate: string|null; license_number: string|null; license_expiry: string|null;
  vehicle_capacity_kg?: number|null;
  rejection_reason: string|null; submitted_at: string|null;
};
export type DriverStatus = { application: DriverApplication|null; profile: {country_code:string;status:string;online:boolean;vehicle_type:string|null;vehicle_plate:string|null;vehicle_capacity_kg?:number|null;latitude:number|null;longitude:number|null}|null };

/** Candidatura por rever, como o administrador a vê (sem os caminhos das fotos). */
export type CandidaturaPendente = {
  user_id: string; country_code: string; status: string; vehicle_type: string|null; vehicle_plate: string|null;
  vehicle_capacity_kg: number|null; license_number: string|null; license_expiry: string|null; submitted_at: string|null;
  email: string|null; full_name: string|null;
};

/** Links temporários (10 min) para os documentos de uma candidatura. */
export type DocumentosCandidatura = Record<'id_document_path'|'license_front_path'|'license_back_path'|'vehicle_document_path'|'selfie_path', string|null>;

export const NOMES_DOCUMENTOS: [keyof DocumentosCandidatura, string][] = [
  ['id_document_path', 'BI / identificação'],
  ['license_front_path', 'Carta — frente'],
  ['license_back_path', 'Carta — verso'],
  ['vehicle_document_path', 'Documento do veículo'],
  ['selfie_path', 'Selfie'],
];

/** Mensagens do servidor (códigos em maiúsculas) em português simples. */
export function mensagemMotorista(erro: string): string {
  const mapa: Record<string, string> = {
    MOTORISTA_KYC_NAO_APROVADO: 'A tua candidatura de motorista ainda não foi aprovada.',
    CANDIDATURA_JA_EM_REVISAO: 'A candidatura já está em revisão.',
    DADOS_KYC_INCOMPLETOS: 'Preenche o tipo de veículo, a matrícula e o número da carta.',
    FICHEIRO_KYC_FORA_DA_PASTA_DO_UTILIZADOR: 'Volta a tirar as fotografias dos documentos.',
    CAPACIDADE_INVALIDA: 'A capacidade do veículo tem de ser um número de kg maior que zero.',
    VALIDADE_DA_CARTA_INVALIDA: 'A validade da carta tem de ter o formato AAAA-MM-DD.',
    MOTIVO_OBRIGATORIO: 'Escreve o motivo da recusa (pelo menos 5 letras).',
    CANDIDATURA_NAO_ESTA_POR_REVER: 'Esta candidatura já foi decidida.',
    NAO_PODES_REVER_A_TUA_CANDIDATURA: 'Não podes decidir a tua própria candidatura.',
    APENAS_ADMINISTRADORES: 'Só os administradores podem rever candidaturas.',
  };
  const codigo = Object.keys(mapa).find((c) => erro.includes(c));
  if (codigo) return mapa[codigo];
  if (/row-level security|violates|Unauthorized/i.test(erro)) return 'O envio foi recusado: a sessão pode ter expirado. Sai e volta a entrar e tenta outra vez.';
  return erro;
}

export const driverKyc = {
  status: () => chamarFuncao<DriverStatus>('driver-kyc','status',{tempoMaximo:20000}),
  submit: (body: Record<string,unknown>) => chamarFuncao<{ok:boolean;application?:DriverApplication;status?:string}>('driver-kyc','submit',{body,tempoMaximo:30000}),
  /** Motorista aprovado fica disponível (ou não) para receber pedidos. */
  setOnline: (online: boolean, posicao?: { latitude: number; longitude: number } | null) =>
    chamarFuncao<{ok:boolean;online:boolean}>('driver-kyc','set_online',{body:{online, ...(posicao ?? {})}}),
  listarPendentes: async () => (await chamarFuncao<{applications:CandidaturaPendente[]}>('driver-kyc','list_pending')).applications ?? [],
  documentos: async (userId: string) => (await chamarFuncao<{links:DocumentosCandidatura}>('driver-kyc','view',{body:{user_id:userId}})).links,
  rever: (userId: string, decisao: 'approve'|'reject', motivo?: string) =>
    chamarFuncao<{ok:boolean;status:string}>('driver-kyc','review',{body:{user_id:userId, decision:decisao, reason:motivo ?? null}}),
};
