import { chamarFuncao } from '@/api/edge/chamarFuncao';

export type MarketplaceListing = {
  id:string; title:string; description:string|null; category:string; price:number;
  currency:string; quantity:number; status:'DRAFT'|'ACTIVE'|'PAUSED'|'SOLD'|'ARCHIVED';
  country_code:string; seller_id:string; created_at:string; updated_at:string;
};

export const marketplace = {
  list: () => chamarFuncao<{country_code:string;listings:MarketplaceListing[]}>('marketplace','list',{tempoMaximo:20000}),
  create: (body: {title:string;description?:string;category:string;price:number;quantity?:number;currency?:string}) =>
    chamarFuncao<{listing:MarketplaceListing}>('marketplace','create',{body,tempoMaximo:20000}),
  publish: (listing_id:string) => chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','publish',{body:{listing_id},tempoMaximo:20000}),
  pause: (listing_id:string) => chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','pause',{body:{listing_id},tempoMaximo:20000}),
};
