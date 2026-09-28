import { describe, it, expect } from '@jest/globals';
import { calcularMatching } from '../domain/entregas/matching';

describe('calcularMatching', () => {
 const base={pesoKg:300,tipoVeiculo:'carrinha',capacidadeKg:500,urgente:false,origem:{latitude:-8.84,longitude:13.23}};
 const ofertas=[
  {id:'a',driverId:'1',tipoVeiculo:'carrinha',capacidadeKg:1000,latitude:-8.85,longitude:13.24,disponivel:true},
  {id:'b',driverId:'2',tipoVeiculo:'moto',capacidadeKg:500,latitude:-8.84,longitude:13.23,disponivel:true},
  {id:'c',driverId:'3',tipoVeiculo:'carrinha',capacidadeKg:200,latitude:-8.84,longitude:13.23,disponivel:true},
  {id:'d',driverId:'4',tipoVeiculo:'carrinha',capacidadeKg:1000,latitude:-8.84,longitude:13.23,disponivel:false},
 ];
 it('mantém compatíveis e alternativas',()=>{const out=calcularMatching(base,ofertas);expect(out.map(x=>x.driverId)).toEqual(['1','3','4','2']);expect(out[0].nivelCompatibilidade).toBe('compativel');expect(out.slice(1).every(x=>x.nivelCompatibilidade==='alternativa')).toBe(true);});
 it('ordena candidatos compatíveis por pontuação',()=>{const p={...base,tipoVeiculo:null,capacidadeKg:0};const out=calcularMatching(p,[ofertas[0],{...ofertas[0],id:'e',driverId:'5',latitude:-9,longitude:14}]);expect(out[0].driverId).toBe('1');});
 it('prioriza pedido urgente',()=>{const out=calcularMatching({...base,urgente:true},[ofertas[0]]);expect(out[0].pontuacao).toBeGreaterThan(100);});
 it('aceita aliases de veículo',()=>{const out=calcularMatching({...base,tipoVeiculo:'camiao'},[{...ofertas[0],tipoVeiculo:'truck'}]);expect(out).toHaveLength(1);});
 it('suporta pedidos antigos',()=>{const out=calcularMatching({pesoKg:null,tipoVeiculo:null,capacidadeKg:null,urgente:false,origem:null},[ofertas[0]]);expect(out).toHaveLength(1);expect(out[0].distanciaKm).toBeNull();});
});