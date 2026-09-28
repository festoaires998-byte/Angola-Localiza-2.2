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