// Country-scoped payment provider facade. No provider secrets are accepted from clients.
// Production adapters must be configured server-side and must return normalized events only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async req=>{try{if(req.method!=="POST")return new Response(JSON.stringify({error:"METHOD_NOT_ALLOWED"}),{status:405});
const body=await req.json(); const country=String(body.country_code||""); const currency=String(body.currency||"");
const {data:cfg}=await db.from("country_configs").select("currency_code,is_active").eq("country_code",country).maybeSingle();
if(!cfg?.is_active)return new Response(JSON.stringify({error:"COUNTRY_PAYMENT_DISABLED"}),{status:409});
if(cfg.currency_code!==currency)return new Response(JSON.stringify({error:"CURRENCY_COUNTRY_MISMATCH"}),{status:409});
if(country!=="AO")return new Response(JSON.stringify({error:"PROVIDER_NOT_CONFIGURED",country_code:country}),{status:409});
return new Response(JSON.stringify({error:"AO_PROVIDER_REQUIRES_SERVER_ADAPTER"}),{status:503});
}catch(e){return new Response(JSON.stringify({error:"INVALID_REQUEST"}),{status:400});}});
