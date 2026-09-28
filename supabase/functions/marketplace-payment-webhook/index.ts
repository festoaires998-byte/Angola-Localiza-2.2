import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-signature","Content-Type":"application/json"};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");

async function hmacHex(secret:string,body:string){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"METHOD_NOT_ALLOWED"}),{status:405,headers:cors});
 const raw=await req.text();const signature=(req.headers.get("x-signature")||"").toLowerCase();const secret=Deno.env.get("PROXYPAY_API_TOKEN")||"";
 if(!secret||!signature)return new Response(JSON.stringify({error:"SIGNATURE_REQUIRED"}),{status:401,headers:cors});
 const expected=await hmacHex(secret,raw);if(!safeEqual(signature,expected))return new Response(JSON.stringify({error:"SIGNATURE_INVALID"}),{status:401,headers:cors});
 const payload=JSON.parse(raw);const payment=payload.payment||payload;
 const externalEventId=String(payment.id||"");if(!externalEventId)return new Response(JSON.stringify({error:"EVENT_ID_REQUIRED"}),{status:422,headers:cors});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:existing}=await db.from("marketplace_payment_events").select("id").eq("provider","PROXYPAY").eq("external_event_id",externalEventId).maybeSingle();
 if(existing)return new Response(JSON.stringify({ok:true,idempotent_replay:true}),{headers:cors});
 const custom=payment.custom_fields||{};const intentId=typeof custom.payment_intent_id==="string"?custom.payment_intent_id:null;
 const amount=Number(payment.amount);if(!Number.isFinite(amount)||amount<=0)return new Response(JSON.stringify({error:"AMOUNT_INVALID"}),{status:422,headers:cors});
 const {data:intent}=intentId?await db.from("marketplace_payment_intents").select("id,status,amount_total,currency,client_id,provider_id,booking_id,country_code").eq("id",intentId).maybeSingle():{data:null};
 if(!intent)return new Response(JSON.stringify({error:"PAYMENT_INTENT_NOT_FOUND"}),{status:404,headers:cors});
 if(intent.country_code!=="AO")return new Response(JSON.stringify({error:"PROVIDER_NAO_CONFIGURADO_NESTE_PAIS",country_code:intent.country_code}),{status:409,headers:cors});
 if(Number(intent.amount_total)!==amount||intent.currency!=="AOA")return new Response(JSON.stringify({error:"AMOUNT_MISMATCH"}),{status:409,headers:cors});
 const rawType=String(payment.event_type||payment.status||"PAYMENT_RECEIVED").toUpperCase(); const eventType=rawType.includes("REFUND")?"REFUND_CONFIRMED":"PAYMENT_RECEIVED"; const {error:ie}=await db.from("marketplace_payment_events").insert({payment_intent_id:intent.id,provider:"PROXYPAY",external_event_id:externalEventId,event_type:eventType,amount,currency:"AOA",raw_payload:payment,signature_valid:true,processed_at:new Date().toISOString()});
 if(ie&&ie.code!=="23505")return new Response(JSON.stringify({error:ie.message}),{status:500,headers:cors});
 if(!ie){ await db.rpc("marketplace_reconcile_payment",{p_payment_id:intent.id}); return await finalizar(); }
 return new Response(JSON.stringify({ok:true,idempotent_replay:true}),{headers:cors});

 async function finalizar(){
   if(eventType==="REFUND_CONFIRMED"){ const {data:refunded,error:re}=await db.from("marketplace_payment_intents").update({status:"REFUNDED",updated_at:new Date().toISOString()}).eq("id",intent.id).in("status",["PAID","PROCESSING"]).select().maybeSingle(); if(re) return new Response(JSON.stringify({error:re.message}),{status:500,headers:cors}); if(refunded){ await db.from("marketplace_provider_ledger").update({status:"REFUNDED",updated_at:new Date().toISOString()}).eq("payment_intent_id",intent.id).in("status",["PENDING","AVAILABLE","HELD"]); await db.from("marketplace_service_bookings").update({status:"CANCELLED",cancelled_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",intent.booking_id).in("status",["SCHEDULED","IN_PROGRESS"]); await db.from("notifications").insert({user_id:intent.client_id,title:"Reembolso confirmado",body:"O reembolso do serviço foi confirmado pelo provedor de pagamento.","entity_type":"marketplace_payment",entity_id:intent.id}); } return new Response(JSON.stringify({ok:true}),{headers:cors}); }
   const {data:recon}=await db.from("marketplace_reconciliation").select("status").eq("entity_type","PAYMENT").eq("entity_id",intent.id).maybeSingle();
   if(recon?.status!=="MATCHED")return new Response(JSON.stringify({error:"PAGAMENTO_AGUARDA_RECONCILIACAO",reconciliation_status:recon?.status||"MISSING"}),{status:409,headers:cors});
   if(intent.status!=="PAID"){
     const {data:updated,error:ue}=await db.from("marketplace_payment_intents").update({status:"PAID",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",intent.id).neq("status","PAID").select().maybeSingle();
     if(ue)return new Response(JSON.stringify({error:ue.message}),{status:500,headers:cors});
     if(updated){ await db.rpc("marketplace_create_provider_ledger",{p_payment_id:intent.id}); await db.from("notifications").insert({user_id:intent.client_id,title:"Pagamento confirmado",body:"O pagamento do serviço foi confirmado.","entity_type":"marketplace_payment",entity_id:intent.id}); }
     if(updated){
       const {data:p}=await db.from("marketplace_service_profiles").select("owner_id").eq("id",intent.provider_id).maybeSingle();
       if(p?.owner_id)await db.from("notifications").insert({user_id:p.owner_id,title:"Pagamento recebido",body:"O pagamento do serviço foi confirmado.","entity_type":"marketplace_payment",entity_id:intent.id});
     }
   }
   return new Response(JSON.stringify({ok:true}),{headers:cors});
 }
});
