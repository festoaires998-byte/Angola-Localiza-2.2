import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const listingsSafe=(rows:any[])=>rows.map(({id,title,category,price,currency,condition,city,province,status,country_code,seller_id,views_count,created_at})=>({id,title,category,price,currency,condition,city,province,status,country_code,seller_id,views_count,created_at}));
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const countries=["AO","MZ","CV","GW","ST"];
const currencyByCountry:Record<string,string>={AO:"AOA",MZ:"MZN",CV:"CVE",GW:"XOF",ST:"STN"};

Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const {data:u}=await db.auth.getUser(token); const uid=u.user?.id;
 if(!uid)return out({error:"SESSAO_INVALIDA"},401);
 const action=new URL(req.url).searchParams.get("action")||"list";
 try{
  const {data:account}=await db.from("user_country_profiles").select("country_code").eq("user_id",uid).maybeSingle();
  const country=account?.country_code;
  if(!country||!countries.includes(country))return out({error:"PAIS_DA_CONTA_EM_FALTA"},422);
  const body=req.method==="GET"?{}:await req.json();

  if(action==="service-providers"){
   const category=typeof body.category==="string"?body.category.trim():"";
   let q=db.from("marketplace_service_profiles").select("id,owner_id,country_code,provider_type,display_name,headline,bio,phone,province,city,neighborhood,verified,active").eq("country_code",country).eq("active",true);
   if(body.provider_type==="FREELANCER"||body.provider_type==="BUSINESS")q=q.eq("provider_type",body.provider_type);
   if(category)q=q.in("id",(await db.from("marketplace_services").select("provider_id").eq("category",category).eq("active",true)).data?.map((x:any)=>x.provider_id)||[]);
   if(typeof body.q==="string"&&body.q.trim())q=q.or("display_name.ilike.%"+body.q.trim()+"%,headline.ilike.%"+body.q.trim()+"%,bio.ilike.%"+body.q.trim()+"%");
   const {data,error}=await q.order("verified",{ascending:false}).order("created_at",{ascending:false}).limit(100);if(error)throw error;
   return out({providers:data||[]});
  }
  if(action==="service-detail"){
   if(typeof body.provider_id!=="string")return out({error:"PRESTADOR_INVALIDO"},422);
   const {data:p,error}=await db.from("marketplace_service_profiles").select("id,owner_id,country_code,provider_type,display_name,headline,bio,phone,province,city,neighborhood,verified,active").eq("id",body.provider_id).eq("country_code",country).eq("active",true).maybeSingle();if(error)throw error;if(!p)return out({error:"PRESTADOR_NAO_ENCONTRADO"},404);
   const {data:services,error:se}=await db.from("marketplace_services").select("id,name,description,category,price_from,currency,active").eq("provider_id",p.id).eq("active",true).order("created_at",{ascending:false});if(se)throw se;
   return out({provider:p,services:services||[]});
  }
  if(action==="service-profile-upsert"){
   const type=body.provider_type==="BUSINESS"?"BUSINESS":"FREELANCER";
   if(typeof body.display_name!=="string"||body.display_name.trim().length<2)return out({error:"NOME_INVALIDO"},422);
   const {data,error}=await db.from("marketplace_service_profiles").upsert({owner_id:uid,country_code:country,provider_type:type,display_name:body.display_name.trim(),headline:typeof body.headline==="string"?body.headline.trim():null,bio:typeof body.bio==="string"?body.bio.trim():null,phone:typeof body.phone==="string"?body.phone.trim():null,province:typeof body.province==="string"?body.province.trim():null,city:typeof body.city==="string"?body.city.trim():null,neighborhood:typeof body.neighborhood==="string"?body.neighborhood.trim():null,updated_at:new Date().toISOString()},{onConflict:"owner_id"}).select().single();if(error)throw error;return out({provider:data});
  }
  if(action==="service-upsert"){
   if(typeof body.name!=="string"||body.name.trim().length<2||typeof body.category!=="string"||!body.category.trim())return out({error:"SERVICO_INVALIDO"},422);
   const {data:p}=await db.from("marketplace_service_profiles").select("id").eq("owner_id",uid).eq("country_code",country).maybeSingle();if(!p)return out({error:"PERFIL_PRESTADOR_OBRIGATORIO"},409);
   const amount=body.price_from===null||body.price_from===""||body.price_from===undefined?null:Number(body.price_from);if(amount!==null&&(!Number.isFinite(amount)||amount<0))return out({error:"PRECO_INVALIDO"},422);
   const values={provider_id:p.id,name:body.name.trim(),description:typeof body.description==="string"?body.description.trim():null,category:body.category.trim(),price_from:amount,currency:currencyByCountry[country],active:body.active!==false,updated_at:new Date().toISOString()};
   const {data,error}=body.id?await db.from("marketplace_services").update(values).eq("id",body.id).eq("provider_id",p.id).select().single():await db.from("marketplace_services").insert(values).select().single();if(error)throw error;return out({service:data});
  }
  if(action==="request-service"){
   if(typeof body.title!=="string"||body.title.trim().length<3||typeof body.description!=="string"||body.description.trim().length<10||typeof body.category!=="string"||!body.category.trim())return out({error:"PEDIDO_INVALIDO"},422);
   const min=body.budget_min==null?null:Number(body.budget_min),max=body.budget_max==null?null:Number(body.budget_max);if((min!==null&&(!Number.isFinite(min)||min<0))||(max!==null&&(!Number.isFinite(max)||max<0))||(min!==null&&max!==null&&max<min))return out({error:"ORCAMENTO_INVALIDO"},422);
   const {data,error}=await db.from("marketplace_service_requests").insert({client_id:uid,country_code:country,category:body.category.trim(),title:body.title.trim(),description:body.description.trim(),province:body.province||null,city:body.city||null,neighborhood:body.neighborhood||null,preferred_date:body.preferred_date||null,budget_min:min,budget_max:max}).select().single();if(error)throw error;return out({request:data});
  }
  if(action==="my-service-requests"){
   const {data,error}=await db.from("marketplace_service_requests").select("*").eq("client_id",uid).eq("country_code",country).order("created_at",{ascending:false}).limit(100);if(error)throw error;return out({requests:data||[]});
  }
  if(action==="open-service-requests"){
   const {data,error}=await db.from("marketplace_service_requests").select("*").eq("country_code",country).eq("status","OPEN").order("created_at",{ascending:false}).limit(100);if(error)throw error;return out({requests:data||[]});
  }
  if(action==="propose-service"){
   if(typeof body.request_id!=="string"||typeof body.message!=="string"||body.message.trim().length<2)return out({error:"PROPOSTA_INVALIDA"},422);
   const {data:p}=await db.from("marketplace_service_profiles").select("id").eq("owner_id",uid).eq("country_code",country).eq("active",true).maybeSingle();if(!p)return out({error:"PERFIL_PRESTADOR_OBRIGATORIO"},409);
   const {data:req}=await db.from("marketplace_service_requests").select("id,country_code,status").eq("id",body.request_id).eq("country_code",country).eq("status","OPEN").maybeSingle();if(!req)return out({error:"PEDIDO_NAO_DISPONIVEL"},409);
   const amount=body.amount==null?null:Number(body.amount);if(amount!==null&&(!Number.isFinite(amount)||amount<0))return out({error:"VALOR_INVALIDO"},422);
   const {data,error}=await db.from("marketplace_service_proposals").upsert({request_id:req.id,provider_id:p.id,provider_user_id:uid,amount,currency:currencyByCountry[country],message:body.message.trim(),proposed_date:body.proposed_date||null,status:"PENDING",updated_at:new Date().toISOString()},{onConflict:"request_id,provider_id"}).select().single();if(error)throw error;return out({proposal:data});
  }
  if(action==="request-detail"){
   if(typeof body.request_id!=="string")return out({error:"PEDIDO_INVALIDO"},422);
   const {data:r,error}=await db.from("marketplace_service_requests").select("*").eq("id",body.request_id).eq("country_code",country).maybeSingle();if(error)throw error;if(!r)return out({error:"PEDIDO_NAO_ENCONTRADO"},404);
   if(r.client_id!==uid){const {data:p}=await db.from("marketplace_service_profiles").select("id").eq("owner_id",uid).eq("country_code",country).maybeSingle();if(!p)return out({error:"ACESSO_NEGADO"},403);}
   const {data:props,error:pe}=await db.from("marketplace_service_proposals").select("*").eq("request_id",r.id).order("created_at",{ascending:false});if(pe)throw pe;return out({request:r,proposals:props||[]});
  }
  if(action==="booking-list"){
   const {data:p}=await db.from("marketplace_service_profiles").select("id").eq("owner_id",uid).eq("country_code",country);const ids=(p||[]).map((x:any)=>x.id);
   let q=db.from("marketplace_service_bookings").select("*").eq("country_code",country);q=ids.length?q.or("client_id.eq."+uid+",provider_id.in.("+ids.join(",")+")"):q.eq("client_id",uid);
   const {data:b,error}=await q.order("created_at",{ascending:false}).limit(100);if(error)throw error;return out({bookings:b||[]});
  }
  if(action==="booking-status"){
   if(typeof body.booking_id!=="string"||typeof body.status!=="string")return out({error:"DADOS_INVALIDOS"},422);
   if(!["SCHEDULED","IN_PROGRESS","COMPLETED","CANCELLED"].includes(body.status))return out({error:"ESTADO_INVALIDO"},422);
   const {data:b,error:be}=await db.from("marketplace_service_bookings").select("*").eq("id",body.booking_id).eq("country_code",country).maybeSingle();if(be)throw be;if(!b)return out({error:"AGENDAMENTO_NAO_ENCONTRADO"},404);
   let owner=b.client_id===uid;if(!owner){const {data:p}=await db.from("marketplace_service_profiles").select("id").eq("id",b.provider_id).eq("owner_id",uid).maybeSingle();owner=!!p;}if(!owner)return out({error:"ACESSO_NEGADO"},403);
   const patch:any={status:body.status,updated_at:new Date().toISOString()};if(body.status==="IN_PROGRESS"&&!b.started_at)patch.started_at=new Date().toISOString();if(body.status==="COMPLETED")patch.completed_at=new Date().toISOString();
   const {data:updated,error}=await db.from("marketplace_service_bookings").update(patch).eq("id",b.id).select().single();if(error)throw error;return out({booking:updated});
  }
  if(action==="review-service"){
   if(typeof body.booking_id!=="string"||!Number.isInteger(Number(body.rating))||Number(body.rating)<1||Number(body.rating)>5)return out({error:"AVALIACAO_INVALIDA"},422);
   const {data:b,error:be}=await db.from("marketplace_service_bookings").select("id,client_id,provider_id,status,country_code").eq("id",body.booking_id).eq("country_code",country).maybeSingle();if(be)throw be;if(!b)return out({error:"AGENDAMENTO_NAO_ENCONTRADO"},404);
   if(b.client_id!==uid||b.status!=="COMPLETED")return out({error:"AVALIACAO_NAO_PERMITIDA"},409);
   const {data:rv,error}=await db.from("marketplace_service_reviews").insert({booking_id:b.id,reviewer_id:uid,provider_id:b.provider_id,rating:Number(body.rating),comment:typeof body.comment==="string"?body.comment.trim()||null:null}).select().single();if(error)throw error;return out({review:rv});
  }

  if(action==="my-proposals"){
   const {data,error}=await db.from("marketplace_service_proposals").select("*").eq("provider_user_id",uid).order("created_at",{ascending:false}).limit(100);if(error)throw error;return out({proposals:data||[]});
  }
  if(action==="accept-proposal"){
   if(typeof body.proposal_id!=="string")return out({error:"PROPOSTA_INVALIDA"},422);
   const {data:p}=await db.from("marketplace_service_proposals").select("id,request_id,provider_user_id,status").eq("id",body.proposal_id).maybeSingle();if(!p)return out({error:"PROPOSTA_NAO_ENCONTRADA"},404);
   const {data:req}=await db.from("marketplace_service_requests").select("id,client_id,status").eq("id",p.request_id).eq("client_id",uid).eq("status","OPEN").maybeSingle();if(!req)return out({error:"PEDIDO_NAO_DISPONIVEL"},409);
   const {error:e1}=await db.from("marketplace_service_proposals").update({status:"REJECTED",updated_at:new Date().toISOString()}).eq("request_id",req.id).neq("id",p.id).eq("status","PENDING");if(e1)throw e1;
   const {data:accepted,error:e2}=await db.from("marketplace_service_proposals").update({status:"ACCEPTED",updated_at:new Date().toISOString()}).eq("id",p.id).select().single();if(e2)throw e2;
   const {error:e3}=await db.from("marketplace_service_requests").update({status:"AWARDED",updated_at:new Date().toISOString()}).eq("id",req.id).eq("client_id",uid).eq("status","OPEN");if(e3)throw e3;
   const {data:booking,error:e4}=await db.from("marketplace_service_bookings").insert({request_id:req.id,proposal_id:p.id,client_id:uid,provider_id:p.provider_id,country_code:country,scheduled_date:accepted.proposed_date||null,status:"SCHEDULED"}).select().single();if(e4)throw e4;
   return out({proposal:accepted,booking});
  }

  if(action==="categories"){
   const {data,error}=await db.from("marketplace_categories").select("id,slug,name,icon").eq("active",true).order("sort_order");
   if(error)throw error; return out({categories:data||[]});
  }

  if(action==="list"){
   const q=typeof body.q==="string"?body.q.trim():"";
   let query=db.from("marketplace_listings").select("id,title,description,category,price,currency,status,condition,province,city,neighborhood,contact_phone,contact_message,country_code,seller_id,views_count,created_at,updated_at").eq("status","ACTIVE").eq("country_code",country);
   if(q)query=query.or("title.ilike.%"+q+"%,description.ilike.%"+q+"%,category.ilike.%"+q+"%");
   if(typeof body.category==="string"&&body.category.trim())query=query.eq("category",body.category.trim());
   if(typeof body.province==="string"&&body.province.trim())query=query.eq("province",body.province.trim());
   if(typeof body.city==="string"&&body.city.trim())query=query.eq("city",body.city.trim());
   if(body.min_price!==undefined){const n=Number(body.min_price);if(Number.isFinite(n))query=query.gte("price",n);}
   if(body.max_price!==undefined){const n=Number(body.max_price);if(Number.isFinite(n))query=query.lte("price",n);}
   const sort=body.sort==="price_asc"?"price":body.sort==="price_desc"?"price":"created_at";
   query=query.order(sort,{ascending:body.sort==="price_asc"});
   const {data,error}=await query.limit(100); if(error)throw error;
   return out({country_code:country,currency:currencyByCountry[country],listings:data||[]});
  }

  if(action==="detail"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const {data:l,error}=await db.from("marketplace_listings").select("id,title,description,category,price,currency,status,condition,province,city,neighborhood,contact_phone,contact_message,country_code,seller_id,views_count,created_at,updated_at").eq("id",body.listing_id).eq("country_code",country).eq("status","ACTIVE").maybeSingle();
   if(error)throw error;if(!l)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);
   const {data:imgs,error:ie}=await db.from("marketplace_listing_images").select("id,storage_path,sort_order").eq("listing_id",l.id).order("sort_order");
   if(ie)throw ie;
   const images=[];
   for(const i of imgs||[]){const {data:u,error:ue}=await db.storage.from("marketplace-media").createSignedUrl(i.storage_path,3600);if(!ue&&u)images.push({id:i.id,storage_path:i.storage_path,sort_order:i.sort_order,url:u.signedUrl});}
   const {data:similar,error:se}=await db.from("marketplace_listings").select("id,title,category,price,currency,condition,city,province,status,country_code,seller_id,views_count,created_at").eq("country_code",country).eq("status","ACTIVE").eq("category",l.category).neq("id",l.id).order("created_at",{ascending:false}).limit(6);
   if(se)throw se;
   await db.from("marketplace_listings").update({views_count:(l.views_count||0)+1}).eq("id",l.id);
   return out({listing:{...l,views_count:(l.views_count||0)+1},images,similar:listingsSafe(similar||[])});
  }

  if(action==="mine"){
   const {data,error}=await db.from("marketplace_listings").select("id,title,description,category,price,currency,status,condition,province,city,neighborhood,contact_phone,contact_message,country_code,seller_id,views_count,created_at,updated_at").eq("seller_id",uid).eq("country_code",country).order("updated_at",{ascending:false}).limit(100);
   if(error)throw error; return out({listings:data||[]});
  }

  if(action==="create"){
   if(typeof body.title!=="string"||body.title.trim().length<3||body.title.trim().length>80)return out({error:"TITULO_INVALIDO"},422);
   if(typeof body.description!=="string"||body.description.trim().length<10||body.description.trim().length>5000)return out({error:"DESCRICAO_INVALIDA"},422);
   if(typeof body.category!=="string"||!body.category.trim())return out({error:"CATEGORIA_OBRIGATORIA"},422);
   const {data:cat}=await db.from("marketplace_categories").select("slug").eq("slug",body.category.trim()).eq("active",true).maybeSingle();
   if(!cat)return out({error:"CATEGORIA_INVALIDA"},422);
   const price=body.price===null||body.price===""||body.price===undefined?null:Number(body.price);
   if(price!==null&&(!Number.isFinite(price)||price<0))return out({error:"PRECO_INVALIDO"},422);
   const condition=body.condition===undefined||body.condition===null?"USED":body.condition;
   if(!["NEW","USED","REFURBISHED"].includes(condition))return out({error:"CONDICAO_INVALIDA"},422);
   const {data,error}=await db.from("marketplace_listings").insert({
     seller_id:uid,country_code:country,title:body.title.trim(),description:body.description.trim(),category:cat.slug,
     price,currency:currencyByCountry[country],condition,province:typeof body.province==="string"?body.province.trim()||null:null,
     city:typeof body.city==="string"?body.city.trim()||null:null,neighborhood:typeof body.neighborhood==="string"?body.neighborhood.trim()||null:null,
     contact_phone:Boolean(body.contact_phone),contact_message:body.contact_message!==false,status:"DRAFT"
   }).select().single();
   if(error)throw error; return out({listing:data});
  }

  if(action==="update"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const patch:any={updated_at:new Date().toISOString()};
   for(const k of ["title","description","province","city","neighborhood"]){if(body[k]!==undefined){if(typeof body[k]!=="string")return out({error:"CAMPO_INVALIDO"},422);patch[k]=body[k].trim()||null;}}
   if(patch.title!==undefined&&(patch.title.length<3||patch.title.length>80))return out({error:"TITULO_INVALIDO"},422);
   if(patch.description!==undefined&&(patch.description.length<10||patch.description.length>5000))return out({error:"DESCRICAO_INVALIDA"},422);
   if(body.category!==undefined){const {data:cat}=await db.from("marketplace_categories").select("slug").eq("slug",body.category).eq("active",true).maybeSingle();if(!cat)return out({error:"CATEGORIA_INVALIDA"},422);patch.category=cat.slug;}
   if(body.price!==undefined){const n=body.price===null||body.price===""?null:Number(body.price);if(n!==null&&(!Number.isFinite(n)||n<0))return out({error:"PRECO_INVALIDO"},422);patch.price=n;}
   if(body.condition!==undefined){if(!["NEW","USED","REFURBISHED"].includes(body.condition))return out({error:"CONDICAO_INVALIDA"},422);patch.condition=body.condition;}
   if(body.contact_phone!==undefined)patch.contact_phone=Boolean(body.contact_phone);
   if(body.contact_message!==undefined)patch.contact_message=Boolean(body.contact_message);
   const {data,error}=await db.from("marketplace_listings").update(patch).eq("id",body.listing_id).eq("seller_id",uid).eq("country_code",country).in("status",["DRAFT","ACTIVE","PAUSED"]).select().maybeSingle();
   if(error)throw error;if(!data)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);return out({listing:data});
  }

  if(action==="publish"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const {data:l}=await db.from("marketplace_listings").select("id,title,description,category").eq("id",body.listing_id).eq("seller_id",uid).eq("country_code",country).eq("status","DRAFT").maybeSingle();
   if(!l)return out({error:"ANUNCIO_NAO_ENCONTRADO_OU_NAO_PUBLICAVEL"},409);
   if(!l.title||!l.description||!l.category)return out({error:"ANUNCIO_INCOMPLETO"},422);
   const {data,error}=await db.from("marketplace_listings").update({status:"ACTIVE",updated_at:new Date().toISOString()}).eq("id",body.listing_id).eq("seller_id",uid).select().single();
   if(error)throw error;return out({listing:data});
  }

  if(action==="pause"||action==="archive"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const status=action==="pause"?"PAUSED":"ARCHIVED";
   const {data,error}=await db.from("marketplace_listings").update({status,updated_at:new Date().toISOString()}).eq("id",body.listing_id).eq("seller_id",uid).in("status",["ACTIVE","PAUSED","DRAFT"]).select("id,status").maybeSingle();
   if(error)throw error;if(!data)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);return out({listing:data});
  }

  if(action==="favorite"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const {data:l}=await db.from("marketplace_listings").select("id").eq("id",body.listing_id).eq("country_code",country).eq("status","ACTIVE").maybeSingle();
   if(!l)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);
   if(body.enabled===false)await db.from("marketplace_listing_favorites").delete().eq("user_id",uid).eq("listing_id",body.listing_id);
   else await db.from("marketplace_listing_favorites").upsert({user_id:uid,listing_id:body.listing_id});
   return out({favorite:body.enabled!==false});
  }

  if(action==="favorites"){
   const {data,error}=await db.from("marketplace_listing_favorites").select("listing_id,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(200);
   if(error)throw error;const ids=(data||[]).map(x=>x.listing_id);
   if(!ids.length)return out({listings:[]});
   const {data:listings,error:e2}=await db.from("marketplace_listings").select("id,title,description,category,price,currency,status,condition,province,city,country_code,seller_id,views_count,created_at,updated_at").in("id",ids).eq("country_code",country);
   if(e2)throw e2;return out({listings:listings||[]});
  }

  if(action==="interest"){
   if(typeof body.listing_id!=="string"||typeof body.message!=="string"||body.message.trim().length<2||body.message.trim().length>1000)return out({error:"CONTACTO_INVALIDO"},422);
   const {data:l}=await db.from("marketplace_listings").select("id,seller_id,contact_message").eq("id",body.listing_id).eq("country_code",country).eq("status","ACTIVE").maybeSingle();
   if(!l)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);
   if(!l.contact_message)return out({error:"CONTACTO_DESATIVADO"},409);
   if(l.seller_id===uid)return out({error:"NAO_PODES_CONTACTAR_TE_A_TI_PROPRIO"},422);
   const {data,error}=await db.from("marketplace_listing_interests").insert({listing_id:l.id,interested_user_id:uid,seller_id:l.seller_id,message:body.message.trim()}).select("id,status,created_at").single();
   if(error)throw error;return out({interest:data});
  }

  if(action==="interests"){
   const {data,error}=await db.from("marketplace_listing_interests").select("id,listing_id,interested_user_id,seller_id,message,status,created_at").or("interested_user_id.eq."+uid+",seller_id.eq."+uid).order("created_at",{ascending:false}).limit(100);
   if(error)throw error;return out({interests:data||[]});
  }

  if(action==="image-upload-url"){
   if(typeof body.listing_id!=="string")return out({error:"ANUNCIO_INVALIDO"},422);
   const {data:l}=await db.from("marketplace_listings").select("id").eq("id",body.listing_id).eq("seller_id",uid).eq("country_code",country).maybeSingle();
   if(!l)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);
   const ext=typeof body.extension==="string"?body.extension.toLowerCase():"";
   if(!["jpg","jpeg","png","webp"].includes(ext))return out({error:"FORMATO_IMAGEM_NAO_SUPORTADO"},422);
   const path=uid+"/"+body.listing_id+"/"+crypto.randomUUID()+"."+ext;
   const {data,error}=await db.storage.from("marketplace-media").createSignedUploadUrl(path);
   if(error||!data)throw error||new Error("UPLOAD_URL_INDISPONIVEL");
   return out({path,token:data.token});
  }

  if(action==="register-image"){
   if(typeof body.listing_id!=="string"||typeof body.storage_path!=="string")return out({error:"IMAGEM_INVALIDA"},422);
   if(!body.storage_path.startsWith(uid+"/"+body.listing_id+"/"))return out({error:"CAMINHO_IMAGEM_INVALIDO"},403);
   const {data:l}=await db.from("marketplace_listings").select("id").eq("id",body.listing_id).eq("seller_id",uid).eq("country_code",country).maybeSingle();
   if(!l)return out({error:"ANUNCIO_NAO_ENCONTRADO"},404);
   const {count}=await db.from("marketplace_listing_images").select("id",{count:"exact",head:true}).eq("listing_id",body.listing_id);
   if((count??0)>=10)return out({error:"LIMITE_DE_IMAGENS_ATINGIDO"},422);
   const {data,error}=await db.from("marketplace_listing_images").insert({listing_id:body.listing_id,owner_id:uid,storage_path:body.storage_path,sort_order:Math.max(0,Number(body.sort_order)||0)}).select("id,storage_path,sort_order").single();
   if(error)throw error;return out({image:data});
  }

  if(action==="image-read-url"){
   if(typeof body.storage_path!=="string")return out({error:"IMAGEM_INVALIDA"},422);
   const {data:i}=await db.from("marketplace_listing_images").select("listing_id").eq("storage_path",body.storage_path).maybeSingle();
   if(!i)return out({error:"IMAGEM_NAO_ENCONTRADA"},404);
   const {data:l}=await db.from("marketplace_listings").select("seller_id,country_code,status").eq("id",i.listing_id).maybeSingle();
   if(!l||l.country_code!==country||((l.status!=="ACTIVE")&&l.seller_id!==uid))return out({error:"ACESSO_IMAGEM_NEGADO"},403);
   const {data,error}=await db.storage.from("marketplace-media").createSignedUrl(body.storage_path,3600);
   if(error||!data)throw error||new Error("URL_IMAGEM_INDISPONIVEL");
   return out({url:data.signedUrl});
  }

  return out({error:"ACAO_DESCONHECIDA"},400);
 }catch(e){return out({error:e instanceof Error?e.message:String(e)},500)}
});