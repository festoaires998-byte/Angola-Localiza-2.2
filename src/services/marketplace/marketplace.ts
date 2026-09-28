import { chamarFuncao } from '@/api/edge/chamarFuncao';
import { supabase } from '@/api/supabase';

export type MarketplaceListing={
 id:string;title:string;description:string|null;category:string;price:number|null;currency:string;
 status:'DRAFT'|'ACTIVE'|'PAUSED'|'ARCHIVED';condition:'NEW'|'USED'|'REFURBISHED'|null;
 province:string|null;city:string|null;neighborhood:string|null;contact_phone:boolean;contact_message:boolean;
 country_code:string;seller_id:string;views_count:number;created_at:string;updated_at:string;
};
export type MarketplaceCategory={id:string;slug:string;name:string;icon:string|null};
export type MarketplaceImage={id:string;storage_path:string;sort_order:number};

export const marketplace={
 categories:()=>chamarFuncao<{categories:MarketplaceCategory[]}>('marketplace','categories',{tempoMaximo:20000}),
 list:(body?:{q?:string;category?:string;province?:string;city?:string;min_price?:number;max_price?:number;sort?:string})=>
   chamarFuncao<{country_code:string;currency:string;listings:MarketplaceListing[]}>('marketplace','list',{body,tempoMaximo:20000}),
 detail:(listing_id:string)=>chamarFuncao<{listing:MarketplaceListing;images:{id:string;storage_path:string;sort_order:number;url:string}[];similar:MarketplaceListing[]}>('marketplace','detail',{body:{listing_id},tempoMaximo:20000}),
 mine:()=>chamarFuncao<{listings:MarketplaceListing[]}>('marketplace','mine',{tempoMaximo:20000}),
 create:(body:Partial<MarketplaceListing>&{title:string;description:string;category:string;price?:number|null})=>
   chamarFuncao<{listing:MarketplaceListing}>('marketplace','create',{body,tempoMaximo:20000}),
 update:(listing_id:string,body:Record<string,unknown>)=>chamarFuncao<{listing:MarketplaceListing}>('marketplace','update',{body:{listing_id,...body},tempoMaximo:20000}),
 publish:(listing_id:string)=>chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','publish',{body:{listing_id},tempoMaximo:20000}),
 pause:(listing_id:string)=>chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','pause',{body:{listing_id},tempoMaximo:20000}),
 archive:(listing_id:string)=>chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','archive',{body:{listing_id},tempoMaximo:20000}),
 favorite:(listing_id:string,enabled:boolean)=>chamarFuncao<{favorite:boolean}>('marketplace','favorite',{body:{listing_id,enabled},tempoMaximo:20000}),
 favorites:()=>chamarFuncao<{listings:MarketplaceListing[]}>('marketplace','favorites',{tempoMaximo:20000}),
 interest:(listing_id:string,message:string)=>chamarFuncao('marketplace','interest',{body:{listing_id,message},tempoMaximo:20000}),
 interests:()=>chamarFuncao('marketplace','interests',{tempoMaximo:20000}),
 prepararImagem:(listing_id:string,extension:'jpg'|'jpeg'|'png'|'webp')=>chamarFuncao<{path:string;token:string}>('marketplace','image-upload-url',{body:{listing_id,extension},tempoMaximo:20000}),
 enviarImagem:async(listing_id:string,file:{uri:string;name?:string;type?:string},sort_order=0)=>{
   const extension=((file.name||'jpg').split('.').pop()||'jpg').toLowerCase() as 'jpg'|'jpeg'|'png'|'webp';
   if(!['jpg','jpeg','png','webp'].includes(extension))throw new Error('FORMATO_IMAGEM_NAO_SUPORTADO');
   const preparado=await marketplace.prepararImagem(listing_id,extension);
   const blob=await (await fetch(file.uri)).blob();
   const {error}=await supabase.storage.from('marketplace-media').uploadToSignedUrl(preparado.path,preparado.token,blob,{contentType:file.type||'image/jpeg'});
   if(error)throw error;
   return chamarFuncao<{image:MarketplaceImage}>('marketplace','register-image',{body:{listing_id,storage_path:preparado.path,sort_order},tempoMaximo:20000});
 },
 imageUrl:(storage_path:string)=>chamarFuncao<{url:string}>('marketplace','image-read-url',{body:{storage_path},tempoMaximo:20000}),
};

export type MarketplaceProvider={id:string;owner_id:string;country_code:string;provider_type:'FREELANCER'|'BUSINESS';display_name:string;headline:string|null;bio:string|null;phone:string|null;province:string|null;city:string|null;neighborhood:string|null;verified:boolean;active:boolean};
export type MarketplaceService={id:string;provider_id:string;name:string;description:string|null;category:string;price_from:number|null;currency:string;active:boolean};
export type MarketplaceServiceRequest={id:string;client_id:string;country_code:string;category:string;title:string;description:string;province:string|null;city:string|null;neighborhood:string|null;preferred_date:string|null;budget_min:number|null;budget_max:number|null;status:string;created_at:string;updated_at:string};
export type MarketplaceProposal={id:string;request_id:string;provider_id:string;provider_user_id:string;amount:number|null;currency:string|null;message:string;proposed_date:string|null;status:string;created_at:string;updated_at:string};
export const marketplaceServices={
 providers:(body?:Record<string,unknown>)=>chamarFuncao<{providers:MarketplaceProvider[]}>('marketplace','service-providers',{body,tempoMaximo:20000}),
 detail:(provider_id:string)=>chamarFuncao<{provider:MarketplaceProvider;services:MarketplaceService[];rating_average:number;review_count:number;identity_verified:boolean;driver_kyc_status:string|null}>('marketplace','service-detail',{body:{provider_id},tempoMaximo:20000}),
 saveProfile:(body:Record<string,unknown>)=>chamarFuncao<{provider:MarketplaceProvider}>('marketplace','service-profile-upsert',{body,tempoMaximo:20000}),
 saveService:(body:Record<string,unknown>)=>chamarFuncao<{service:MarketplaceService}>('marketplace','service-upsert',{body,tempoMaximo:20000}),
 request:(body:Record<string,unknown>)=>chamarFuncao<{request:MarketplaceServiceRequest}>('marketplace','request-service',{body,tempoMaximo:20000}),
 myRequests:()=>chamarFuncao<{requests:MarketplaceServiceRequest[]}>('marketplace','my-service-requests',{tempoMaximo:20000}),
 openRequests:()=>chamarFuncao<{requests:MarketplaceServiceRequest[]}>('marketplace','open-service-requests',{tempoMaximo:20000}),
 propose:(body:Record<string,unknown>)=>chamarFuncao<{proposal:MarketplaceProposal}>('marketplace','propose-service',{body,tempoMaximo:20000}),
 myProposals:()=>chamarFuncao<{proposals:MarketplaceProposal[]}>('marketplace','my-proposals',{tempoMaximo:20000}),
 acceptProposal:(proposal_id:string)=>chamarFuncao<{proposal:MarketplaceProposal}>('marketplace','accept-proposal',{body:{proposal_id},tempoMaximo:20000}),
};
export const marketplaceServiceFlow={
 requestDetail:(request_id:string)=>chamarFuncao<{request:MarketplaceServiceRequest;proposals:MarketplaceProposal[]}>('marketplace','request-detail',{body:{request_id},tempoMaximo:20000}),
 bookings:()=>chamarFuncao<{bookings:Array<Record<string,unknown>>}>('marketplace','booking-list',{tempoMaximo:20000}),
 updateBooking:(booking_id:string,status:string)=>chamarFuncao<{booking:Record<string,unknown>}>('marketplace','booking-status',{body:{booking_id,status},tempoMaximo:20000}),
 review:(booking_id:string,rating:number,comment?:string)=>chamarFuncao<{review:Record<string,unknown>}>('marketplace','review-service',{body:{booking_id,rating,comment},tempoMaximo:20000}),
 requestDelivery:(body:{booking_id:string;address_id:string;recipient_name:string;recipient_phone:string;instructions?:string;origin_latitude?:number|null;origin_longitude?:number|null;origin_municipality_id?:string|null;origin_province_id?:string|null;origin_postal_code?:string|null;origin_plus_code?:string|null;zone_code?:string|null;is_urgent?:boolean})=>chamarFuncao<{logistics:Record<string,unknown>;delivery:Record<string,unknown>}>('marketplace','request-delivery',{body,tempoMaximo:30000}),
 createPaymentIntent:(body:{booking_id:string;payment_method?:'PROXYPAY_MULTICAIXA'|'PROXYPAY_GPO';idempotency_key:string})=>chamarFuncao<{payment:Record<string,unknown>}>('marketplace','create-payment-intent',{body,tempoMaximo:20000}),
 createProxyPayReference:(payment_intent_id:string)=>chamarFuncao<{payment:Record<string,unknown>;instructions:Record<string,unknown>}>('marketplace','create-proxypay-reference',{body:{payment_intent_id},tempoMaximo:30000}),
};