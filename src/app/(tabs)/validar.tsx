import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Botao, Caixa, Ecra, Titulo } from '@/components/ui';
import { CORES, TAMANHOS } from '@/components/tema';
import { listarValidacoesPendentes, validarLevantamento, type DecisaoValidacao, type ValidacaoCampo } from '@/services/validacao/validacao';

export default function Validar() {
  const [registos, setRegistos] = useState<ValidacaoCampo[]>([]);
  const [carregar, setCarregar] = useState(true);
  const [atualizar, setAtualizar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErro(null);
    try { setRegistos(await listarValidacoesPendentes()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar os levantamentos.'); }
    finally { setCarregar(false); setAtualizar(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function decidir(r: ValidacaoCampo, decision: DecisaoValidacao) {
    setErro(null); setProcessando(r.id);
    try { await validarLevantamento(r.id, decision); setRegistos(xs => xs.filter(x => x.id !== r.id)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir a validação.'); }
    finally { setProcessando(null); }
  }
  if (carregar) return <View style={s.loading}><ActivityIndicator size="large" color={CORES.primaria}/><Text style={s.text}>A carregar levantamentos para validar…</Text></View>;
  return <Ecra>
    <Titulo>Validar</Titulo>
    <Text style={s.sub}>Levantamentos de campo por validar.</Text>
    {erro ? <Caixa tipo="erro">{erro}</Caixa> : null}
    <View style={s.row}><Text style={s.count}>{registos.length} por validar</Text><Pressable accessibilityRole="button" onPress={() => {setAtualizar(true); void load();}}><Text style={s.link}>Atualizar</Text></Pressable></View>
    {atualizar ? <ActivityIndicator color={CORES.primaria}/> : null}
    {!registos.length ? <Caixa tipo="sucesso">Não há levantamentos pendentes de validação.</Caixa> : null}
    {registos.map(r => {
      const dup = !!r.duplicate_of_address_id || !!r.duplicate_override_reason;
      const rua = r.streets?.name || 'Rua sem nome';
      const quadra = r.quadras?.code || 'Quadra não identificada';
      const busy = processando === r.id;
      return <View key={r.id} style={s.card}>
        {dup ? <View style={s.warn}><Text style={s.warnText}>⚠️ POSSÍVEL DUPLICADO — {r.duplicate_override_reason || 'confirme se é um local diferente.'}</Text></View> : null}
        <Text style={s.place}>{rua} · {quadra}</Text>
        <Text style={s.coords}>· {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</Text>
        <Text style={s.number}>🔢 Vai ficar: nº {r.preview_house_number ?? 'a atribuir'}</Text>
        {r.reference ? <Text style={s.ref}>📍 {r.reference}</Text> : null}
        {r.watermark_match === false ? <Caixa tipo="aviso">⚠️ A marca de água da fotografia não coincide com a localização declarada.</Caixa> : null}
        {r.photo_url ? <Image accessibilityLabel="Fotografia da fachada" source={{uri:r.photo_url}} style={s.photo}/> : null}
        {dup ? <>
          <Botao titulo="Fundir com existente" onPress={() => void decidir(r,'merge')} desativado={busy} aCarregar={busy}/>
          <Botao titulo="Aceitar como novo" onPress={() => void decidir(r,'approve')} variante="secundario" desativado={busy}/>
        </> : <>
          <Botao titulo="Aprovar" onPress={() => void decidir(r,'approve')} desativado={busy} aCarregar={busy}/>
          <Botao titulo="Duplicado" onPress={() => void decidir(r,'duplicate')} variante="secundario" desativado={busy}/>
        </>}
        <Botao titulo="Rejeitar" onPress={() => void decidir(r,'reject')} variante="perigo" desativado={busy}/>
      </View>;
    })}
    <Text style={s.footer}>A validação é autorizada pelo servidor e protegida contra duas validações simultâneas do mesmo registo.</Text>
  </Ecra>;
}
const s=StyleSheet.create({
 loading:{flex:1,backgroundColor:CORES.fundo,alignItems:'center',justifyContent:'center',padding:24,gap:16},
 text:{fontSize:TAMANHOS.texto,color:CORES.texto,textAlign:'center'},sub:{fontSize:TAMANHOS.texto,lineHeight:26,color:CORES.textoSuave},
 row:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},count:{fontSize:TAMANHOS.subtitulo,fontWeight:'700',color:CORES.texto},
 link:{fontSize:TAMANHOS.texto,fontWeight:'700',color:CORES.primaria,textDecorationLine:'underline'},
 card:{borderWidth:1,borderColor:CORES.borda,borderRadius:TAMANHOS.raio,padding:16,gap:10,backgroundColor:CORES.fundo},
 warn:{borderRadius:TAMANHOS.raio,borderWidth:1,borderColor:CORES.avisoBorda,backgroundColor:CORES.avisoFundo,padding:12},
 warnText:{fontSize:TAMANHOS.textoPequeno,lineHeight:22,color:CORES.avisoTexto,fontWeight:'700'},place:{fontSize:TAMANHOS.subtitulo,fontWeight:'700',color:CORES.texto},
 coords:{fontSize:TAMANHOS.textoPequeno,color:CORES.textoSuave},number:{fontSize:TAMANHOS.texto,color:CORES.primaria,fontWeight:'700'},ref:{fontSize:TAMANHOS.texto,color:CORES.texto},
 photo:{width:'100%',height:220,borderRadius:TAMANHOS.raio,backgroundColor:CORES.fundoSuave},footer:{fontSize:TAMANHOS.textoPequeno,lineHeight:22,color:CORES.textoSuave,paddingBottom:20}
});