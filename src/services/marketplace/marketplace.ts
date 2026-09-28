import { chamarFuncao } from '@/api/edge/chamarFuncao';
import { supabase } from '@/api/supabase';

export type MarketplaceListing = {
  id:string; title:string; description:string|null; category:string; price:number;
  currency:string; quantity:number; status:'DRAFT'|'ACTIVE'|'PAUSED'|'SOLD'|'ARCHIVED';
  country_code:string; seller_id:string; created_at:string; updated_at:string;
};

export const marketplace = {
  prepararImagem: (listing_id:string, extension:'jpg'|'jpeg'|'png'|'webp') =>
    chamarFuncao<{path:string;token:string}>('marketplace','image-upload-url',{body:{listing_id,extension},tempoMaximo:20000}),
  enviarImagem: async (listing_id:string, file: {uri:string;name:string;type?:string}, sort_order=0) => {
    const extension=(file.name.split('.').pop()||'').toLowerCase() as 'jpg'|'jpeg'|'png'|'webp';
    if(!['jpg','jpeg','png','webp'].includes(extension)) throw new Error('FORMATO_IMAGEM_NAO_SUPORTADO');
    const preparado=await marketplace.prepararImagem(listing_id,extension);
    const resposta=await fetch(file.uri);
    const blob=await resposta.blob();
    const {error}=await supabase.storage.from('marketplace-media').uploadToSignedUrl(preparado.path,preparado.token,blob);
    if(error) throw error;
    return chamarFuncao<{image:{id:string;storage_path:string;sort_order:number}}>('marketplace','register-image',{body:{listing_id,storage_path:preparado.path,sort_order},tempoMaximo:20000});
  },
  list: () => chamarFuncao<{country_code:string;listings:MarketplaceListing[]}>('marketplace','list',{tempoMaximo:20000}),
  create: (body: {title:string;description?:string;category:string;price:number;quantity?:number;currency?:string}) =>
    chamarFuncao<{listing:MarketplaceListing}>('marketplace','create',{body,tempoMaximo:20000}),
  publish: (listing_id:string) => chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','publish',{body:{listing_id},tempoMaximo:20000}),
  pause: (listing_id:string) => chamarFuncao<{listing:Pick<MarketplaceListing,'id'|'status'>}>('marketplace','pause',{body:{listing_id},tempoMaximo:20000}),
};
