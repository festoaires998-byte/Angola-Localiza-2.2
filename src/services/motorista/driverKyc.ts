import { chamarFuncao } from '@/api/edge/chamarFuncao';

export type DriverApplication = {
  id: string; user_id: string; country_code: string; status: 'DRAFT'|'PENDING_REVIEW'|'APPROVED'|'REJECTED';
  vehicle_type: string|null; vehicle_plate: string|null; license_number: string|null; license_expiry: string|null;
  rejection_reason: string|null; submitted_at: string|null;
};
export type DriverStatus = { application: DriverApplication|null; profile: {country_code:string;status:string;online:boolean;vehicle_type:string|null;vehicle_plate:string|null;latitude:number|null;longitude:number|null}|null };

export const driverKyc = {
  status: () => chamarFuncao<DriverStatus>('driver-kyc','status',{tempoMaximo:20000}),
  submit: (body: Record<string,unknown>) => chamarFuncao<{ok:boolean;application?:DriverApplication;status?:string}>('driver-kyc','submit',{body,tempoMaximo:30000}),
};
