export const TIPOS_VEICULO = ['moto','carro','carrinha','furgão','camião'] as const;
export type TipoVeiculo = typeof TIPOS_VEICULO[number];

export interface PedidoMatching { pesoKg:number|null; tipoVeiculo:string|null; capacidadeKg:number|null; urgente:boolean; origem:{latitude:number;longitude:number}|null; }
export interface OfertaMatching { id:string; driverId:string; tipoVeiculo:string; capacidadeKg:number; latitude:number|null; longitude:number|null; disponivel:boolean; }
export interface ResultadoMatching { ofertaId:string; driverId:string; pontuacao:number; distanciaKm:number|null; motivos:string[]; }

const aliases:Record<string,TipoVeiculo>={motociclo:'moto',mota:'moto',van:'carrinha',furgoneta:'furgão',camiao:'camião',truck:'camião'};
function tipo(v:string|null):TipoVeiculo|null { if(!v)return null; const x=v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); return (TIPOS_VEICULO as readonly string[]).map(s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')).includes(x)?(x==='furgão'?'furgão':x) as TipoVeiculo:aliases[v.toLowerCase()]??null; }
function distancia(a:{latitude:number;longitude:number}|null,b:{latitude:number|null;longitude:number|null}):number|null { if(!a||b.latitude==null||b.longitude==null)return null; const R=6371,rad=Math.PI/180; const p1=a.latitude*rad,p2=b.latitude*rad,dp=(b.latitude-a.latitude)*rad,dl=(b.longitude-a.longitude)*rad; const q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2; return 2*R*Math.asin(Math.sqrt(q)); }

export function calcularMatching(p:PedidoMatching, ofertas:OfertaMatching[]):ResultadoMatching[]{
 return ofertas.filter(o=>o.disponivel&&o.capacidadeKg>=Math.max(p.pesoKg??0,p.capacidadeKg??0))
 .filter(o=>!tipo(p.tipoVeiculo)||tipo(o.tipoVeiculo)===tipo(p.tipoVeiculo))
 .map(o=>{const d=distancia(p.origem,o);let score=100;const motivos:string[]=['capacidade compatível'];if(tipo(p.tipoVeiculo)){score+=25;motivos.push('tipo de veículo compatível')}if(d!=null){score+=Math.max(0,30-Math.min(30,d*3));motivos.push('proximidade considerada')}if(p.urgente){score+=5;motivos.push('pedido urgente priorizado')}return {ofertaId:o.id,driverId:o.driverId,pontuacao:Math.round(score*100)/100,distanciaKm:d==null?null:Math.round(d*100)/100,motivos};}).sort((a,b)=>b.pontuacao-a.pontuacao);
}