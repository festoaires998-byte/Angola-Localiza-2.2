import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const countries=["AO","MZ","CV","GW","ST"];
Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const {data:u}=await db.auth.getUser(token); const uid=u.user?.id;
 if(!uid)return out({error:"SESSAO_INVALIDA"},401);
 const action=new URL(req.url).searchParams.get("action")||"list";
 try{
  if(action==="list"){
   const {data:account}=await db.from("user_country_profiles").select("country_code").eq("user_id",uid).maybeSingle();
   if(!account?.country_code||!countries.includes(account.country_code))return out({error:"PAIS_DA_CONTA_EM_FALTA"},422);
   const {data,error}=await db.from("marketplace_listings").select("id,title,description,category,price,currency,quantity,status,country_code,seller_id,created_at,updated_at").eq("status","ACTIVE").eq("country_code",account.country_code).order("created_at",{ascending:false}).limit(100);
   if(error)throw error; return out({country_code:account.country_code,listings:data||[]});
  }
  const body=await req.json();
  const {data:account}=await db.from("user_country_profiles").select("country_code").eq("user_id",uid).maybeSingle();
  if(!account?.country_code||!countries.includes(account.country_code))return out({error:"PAIS_DA_CONTA_EM_FALTA"},422);
  if(action==="create"){
   if(typeof body.title!=="string"||body.title.trim().length<3||body.title.trim().length>120)return out({error:"TITULO_INVALIDO"},422);
   if(typeof body.category!=="string"||!body.category.trim())return out({error:"CATEGORIA_OBRIGATORIA"},422);
   const price=Number(body.price), quantity=Number(body.quantity??1);
   if(!Number.isFinite(price)||price<0||!Number.isInteger(quantity)||quantity<0)return out({error:"PRECO_OU_QUANTIDADE_INVALIDOS"},422);
   const {data,error}=await db.from("marketplace_listings").insert({seller_id:uid,country_code:account.country_code,title:body.title.trim(),description:typeof body.description==="string"?body.description.trim():null,category:body.category.trim(),price,currency:typeof body.currency==="string"?body.currency.toUpperCase():"AOA",quantity,status:"DRAFT"}).select().single();
   if(error)throw error; return out({listing:data});
  }
  if(action==="publish"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const {data,error}=await db.from("marketplace_listings").update({status:"ACTIVE",updated_at:new Date().toISOString()}).eq("id",body.listing_id).eq("seller_id",uid).eq("country_code",account.country_code).eq("status","DRAFT").select("id,status").maybeSingle();
   if(error)throw error; if(!data)return out({error:"ANUNCIO_NAO_ENCONTRADO_OU_NAO_PUBLICAVEL"},409); return out({listing:data});
  }
  if(action==="pause"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const {data,error}=await db.from("marketplace_listings").update({status:"PAUSED",updated_at:new Date().toISOString()}).eq("id",body.listing_id).eq("seller_id",uid).eq("status","ACTIVE").select("id,status").maybeSingle();
   if(error)throw error; if(!data)return out({error:"ANUNCIO_NAO_ENCONTRADO_OU_NAO_ATIVO"},409); return out({listing:data});
  }
  return out({error:"ACAO_DESCONHECIDA"},400);
 }catch(e){return out({error:String(e)},500)}
});