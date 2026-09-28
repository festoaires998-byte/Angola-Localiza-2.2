import { chamarFuncao } from '@/api/edge/chamarFuncao';

export interface MarketplaceDeliveryAddress {
  id?: string;
  postal_code?: string | null;
  plus_code?: string | null;
  reference?: string | null;
  status?: string | null;
  flagged_for_review?: boolean | null;
  confidence_score?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface MarketplaceDelivery {
  id: string;
  tracking_code?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  status?: string | null;
  addresses?: MarketplaceDeliveryAddress | null;
  destination?: MarketplaceDeliveryAddress | null;
  [key: string]: unknown;
}

export interface MarketplaceEstafeta {
  id: string;
  email?: string | null;
  [key: string]: unknown;
}

export interface DispatchDriverStats {
  events?: number;
  delivered?: number;
  failed?: number;
  [key: string]: unknown;
}

export interface DispatchContext {
  drivers?: Record<string, DispatchDriverStats>;
  [key: string]: unknown;
}

export const marketplaceEntregas = {
  entregasDisponiveis: () =>
    chamarFuncao<{ deliveries: MarketplaceDelivery[] }>('admin', 'list_unassigned_deliveries', { tempoMaximo: 20_000 }),
  estafetas: () =>
    chamarFuncao<{ estafetas: MarketplaceEstafeta[] }>('admin', 'list_estafetas', { tempoMaximo: 20_000 }),
  contextoAtribuicao: (deliveryId: string) =>
    chamarFuncao<DispatchContext>('admin', 'dispatch_context', {
      body: { delivery_id: deliveryId },
      tempoMaximo: 20_000,
    }),
  atribuir: (deliveryId: string, driverId: string) =>
    chamarFuncao<{ error?: string; [key: string]: unknown }>('deliveries', 'assign_driver', {
      body: { delivery_id: deliveryId, driver_id: driverId },
      tempoMaximo: 30_000,
    }),
};
