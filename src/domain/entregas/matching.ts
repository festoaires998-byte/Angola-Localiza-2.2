export const TIPOS_VEICULO = ['moto','carro','carrinha','furgão','camião'] as const;
export type TipoVeiculo = typeof TIPOS_VEICULO[number];

export interface PedidoMatching { pesoKg:number|null; tipoVeiculo:string|null; capacidadeKg:number|null; urgente:boolean; origem:{latitude:number;longitude:number}|null; }
export interface OfertaMatching { id:string; driverId:string; tipoVeiculo:string; capacidadeKg:number; latitude:number|null; longitude:number|null; disponivel:boolean; }
export type NivelCompatibilidade = 'compativel' | 'alternativa' | 'incompativel';
export interface ResultadoMatching { ofertaId:string; driverId:string; pontuacao:number; distanciaKm:number|null; motivos:string[]; nivelCompatibilidade:NivelCompatibilidade; }

const aliases:Record<string,TipoVeiculo>={motociclo:'moto',mota:'moto',van:'carrinha',furgoneta:'furgão',camiao:'camião',truck:'camião'};
function tipo(v:string|null):TipoVeiculo|null {
 if(!v)return null;
 const normalizado=v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const porNomeNormalizado:Record<string,TipoVeiculo>={
  moto:'moto',motociclo:'moto',mota:'moto',
  carro:'carro',
  carrinha:'carrinha',van:'carrinha',
  furgoneta:'furgão',furgao:'furgão',
  camiao:'camião',truck:'camião'
 };
 return porNomeNormalizado[normalizado]??aliases[v.toLowerCase()]??null;
}
function distancia(a:{latitude:number;longitude:number}|null,b:{latitude:number|null;longitude:number|null}):number|null { if(!a||b.latitude==null||b.longitude==null)return null; const R=6371,rad=Math.PI/180; const p1=a.latitude*rad,p2=b.latitude*rad,dp=(b.latitude-a.latitude)*rad,dl=(b.longitude-a.longitude)*rad; const q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2; return 2*R*Math.asin(Math.sqrt(q)); }

export function calcularMatching(p:PedidoMatching, ofertas:OfertaMatching[]):ResultadoMatching[]{
 return ofertas.map(o=>{
   const motivos:string[]=[];
   let score=100;
   const pedidoCap=Math.max(p.pesoKg??0,p.capacidadeKg??0);
   const tipoPedido=tipo(p.tipoVeiculo);
   const tipoOferta=tipo(o.tipoVeiculo);
   if(!o.disponivel){score-=45;motivos.push('transportador atualmente indisponível');}
   if(pedidoCap>0 && o.capacidadeKg<pedidoCap){score-=40;motivos.push('capacidade inferior à solicitada');}
   else motivos.push('capacidade compatível');
   if(tipoPedido && tipoOferta!==tipoPedido){score-=25;motivos.push('tipo de veículo diferente do solicitado');}
   else if(tipoPedido) {score+=25;motivos.push('tipo de veículo compatível');}
   const d=distancia(p.origem,o);
   if(d!=null){score+=Math.max(0,30-Math.min(30,d*3));motivos.push('proximidade considerada');}
   if(p.urgente){score+=5;motivos.push('pedido urgente priorizado');}
   const comp = o.disponivel && (pedidoCap<=0 || o.capacidadeKg>=pedidoCap) && (!tipoPedido || tipoOferta===tipoPedido);
   const nivel: NivelCompatibilidade = comp ? 'compativel' : 'alternativa';
   return {ofertaId:o.id,driverId:o.driverId,pontuacao:Math.round(score*100)/100,distanciaKm:d==null?null:Math.round(d*100)/100,motivos,nivelCompatibilidade:nivel};
 }).sort((a,b)=>{
   if(a.nivelCompatibilidade!==b.nivelCompatibilidade) return a.nivelCompatibilidade==='compativel'?-1:1;
   return b.pontuacao-a.pontuacao;
 });
}