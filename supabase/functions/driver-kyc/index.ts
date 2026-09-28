import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const {data:a}=await supabase.auth.getUser(token);
  const uid=a.user?.id; if(!uid) return out({error:"SESSAO_INVALIDA"},401);
  try{
    const action=new URL(req.url).searchParams.get("action")||"status";
    const body=req.method==="POST"?await req.json().catch(()=>({})):{};
    if(action==="status"){
      const {data}=await supabase.from("driver_applications").select("*").eq("user_id",uid).maybeSingle();
      const {data:profile}=await supabase.from("driver_profiles").select("country_code,status,online,vehicle_type,vehicle_plate,latitude,longitude").eq("user_id",uid).maybeSingle();
      return out({application:data,profile});
    }
    if(action==="submit"){
      const {data:account}=await supabase.from("user_country_profiles").select("country_code").eq("user_id",uid).maybeSingle();
      const country=account?.country_code;
      if(!country) return out({error:"PAIS_DA_CONTA_EM_FALTA"},422);
      if(!["AO","MZ","CV","GW","ST"].includes(country)) return out({error:"PAIS_NAO_SUPORTADO"},422);
      const required=["vehicle_type","vehicle_plate","license_number","id_document_path","license_front_path","license_back_path","vehicle_document_path","selfie_path"];
      const paths=["id_document_path","license_front_path","license_back_path","vehicle_document_path","selfie_path"];
      if(paths.some(k=>typeof body[k]!=="string" || !(body[k] as string).startsWith(uid+"/"))) return out({error:"FICHEIRO_KYC_FORA_DA_PASTA_DO_UTILIZADOR"},422);
      if(required.some(k=>typeof body[k]!=="string"||!body[k].trim())) return out({error:"DADOS_KYC_INCOMPLETOS"},422);
      const {data:exist}=await supabase.from("driver_applications").select("status").eq("user_id",uid).maybeSingle();
      if(exist?.status==="APPROVED") return out({ok:true,status:"APPROVED"});
      const {data,rowError}=await supabase.from("driver_applications").upsert({
        user_id:uid,country_code:country,status:"PENDING_REVIEW",vehicle_type:body.vehicle_type.trim(),vehicle_plate:body.vehicle_plate.trim().toUpperCase(),
        license_number:body.license_number.trim(),license_expiry:body.license_expiry||null,id_document_path:body.id_document_path,
        license_front_path:body.license_front_path,license_back_path:body.license_back_path,vehicle_document_path:body.vehicle_document_path,
        selfie_path:body.selfie_path,submitted_at:new Date().toISOString(),rejection_reason:null
      },{onConflict:"user_id"}).select("id,status,country_code,submitted_at").single();
      if(rowError) return out({error:rowError.message},400);
      return out({ok:true,application:data},200);
    }
    if(action==="review"){
      const {data:isAdmin}=await supabase.rpc("is_admin",{check_user_id:uid});
      if(!isAdmin) return out({error:"APENAS_ADMINISTRADORES"},403);
      if(typeof body.user_id!=="string" || !["approve","reject"].includes(body.decision)) return out({error:"REVISAO_INVALIDA"},400);
      if(body.user_id===uid) return out({error:"NAO_PODES_REVER_A_TUA_CANDIDATURA"},403);
      const next=body.decision==="approve"?"APPROVED":"REJECTED";
      if(next==="REJECTED" && (typeof body.reason!=="string"||body.reason.trim().length<5)) return out({error:"MOTIVO_OBRIGATORIO"},422);
      const {data:app}=await supabase.from("driver_applications").select("*").eq("user_id",body.user_id).maybeSingle();
      if(!app || app.status!=="PENDING_REVIEW") return out({error:"CANDIDATURA_NAO_ESTA_POR_REVER"},409);
      const now=new Date().toISOString();
      const {data:changed,error}=await supabase.from("driver_applications").update({status:next,reviewed_at:now,reviewed_by:uid,rejection_reason:next==="REJECTED"?body.reason.trim():null}).eq("user_id",body.user_id).eq("status","PENDING_REVIEW").select("id");
      if(error) return out({error:error.message},400);
      if(!changed?.length) return out({error:"REVISAO_CONCORRENTE"},409);
      if(next==="APPROVED"){
        const {error:e}=await supabase.from("driver_profiles").upsert({user_id:body.user_id,country_code:app.country_code,status:"APPROVED",online:false,vehicle_type:app.vehicle_type,vehicle_plate:app.vehicle_plate,updated_at:now},{onConflict:"user_id"});
        if(e) return out({error:e.message},500);
      }
      return out({ok:true,status:next});
    }
    return out({error:"ACAO_DESCONHECIDA"},400);
  }catch(e){return out({error:String(e)},500);}
});